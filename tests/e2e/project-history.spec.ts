import { test, expect } from '@playwright/test';
import { nativeFixture } from '../fixtures/native.js';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Project } from '../../src/shared/contracts.js';
test('native history stays scoped when projects share an origin', async () => {
  const fixture = await nativeFixture(
    '<!doctype html><title>History fixture</title><h1>Fixture</h1>',
  );
  const { context, project, client } = fixture;
  try {
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const page = await context.newPage();
    await page.goto(fixture.origin);
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${new URL(worker.url()).host}/panel.html`);
    await panel.getByRole('button', { name: '高级：手动配对', exact: true }).click();
    await panel.locator('#token').fill(fixture.token);
    await panel.locator('#connect').click();
    await page.bringToFront();
    const binding = await client.callTool({
      name: 'pointdom_bind_project',
      arguments: { path: project.cwd },
    });
    const recipient = JSON.parse((binding.content as { text: string }[])[0]!.text).connection.id;
    const waiting = fixture.wait();
    await expect
      .poll(async () => {
        const snapshot = (await fixture.local('/snapshot')) as { agents: { listening: boolean }[] };
        return snapshot.agents.some((a) => a.listening);
      })
      .toBe(true);
    const id = randomUUID();
    const response = await fetch(fixture.origin + '/api/jobs', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${fixture.token}`,
        'X-PagePatch-Client': new URL(worker.url()).host,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id,
        projectId: project.id,
        recipientId: recipient,
        executor: 'mcp',
        instruction: '按独立描述修改 1 个元素',
        selection: {
          url: fixture.origin,
          title: 'Fixture',
          selector: 'h1',
          label: 'Heading',
          description: 'Original project request. Keep the colors.',
          tag: 'h1',
          viewport: { width: 800, height: 600 },
          rect: { x: 0, y: 0, width: 100, height: 20 },
          styles: {},
        },
      }),
    });
    expect(response.status).toBe(202);
    await waiting;
    await client.callTool({
      name: 'pointdom_claim_task',
      arguments: { projectId: project.id, taskId: id, agent: 'Selection fixture' },
    });
    await client.callTool({
      name: 'pointdom_report_task',
      arguments: {
        projectId: project.id,
        taskId: id,
        outcome: 'completed',
        summary: 'History fixture',
        files: [],
        verification: 'Fixture only',
      },
    });
    await expect(panel.locator('#job-count')).toHaveText('1');
    await expect(panel.locator('#jobs .job-head strong')).toHaveText('Original project request.');
    await expect(panel.locator('#jobs')).not.toContainText('按独立描述修改');
    const cwd = join(fixture.directory, 'empty');
    mkdirSync(cwd);
    const next = (await fixture.local('/projects', {
      path: cwd,
      name: 'Empty project',
      origin: fixture.origin,
    })) as { project: Project };
    expect(next.project.id).not.toBe(project.id);
    await panel.locator('#refresh').click();
    await expect(panel.locator('#jobs .job')).toHaveCount(0);
    await expect(panel.locator('#project-field')).toBeVisible();
    await panel.locator('#project').click();
    await panel.getByRole('option', { name: 'Empty project', exact: true }).click();
    await panel.locator('#close-connection').click();
    await expect(panel.locator('#project-path')).toHaveText('Empty project');
    await expect(panel.locator('#job-count')).toHaveText('0');
    await panel.locator('#connection-settings').click();
    await panel.locator('#project').click();
    await panel.getByRole('option', { name: project.name, exact: true }).click();
    await panel.locator('#close-connection').click();
    await expect(panel.locator('#job-count')).toHaveText('1');
    await expect(panel.locator('#jobs')).toContainText('Original project request');
    expect(fixture.jobs()).toHaveLength(1);
  } finally {
    await fixture.close();
  }
});
