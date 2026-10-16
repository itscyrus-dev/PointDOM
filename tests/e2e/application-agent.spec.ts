import { test, expect, chromium } from '@playwright/test';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../../src/bridge/store.js';
import { Queue } from '../../src/bridge/queue.js';
import { createApp } from '../../src/bridge/server.js';
import { extensionBrowserArgs } from './browser-args.js';

test('generic MCP submissions stay queued across projects without desktop-send controls', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pointdom-generic-mcp-'));
  const extension = join(directory, 'extension');
  cpSync(resolve('dist/extension'), extension, { recursive: true });
  const store = new Store(join(directory, 'state'));
  // Old opt-ins must not revive automation after the product becomes generic MCP.
  store.config.traeAutoSend = true;
  const app = new Hono();
  app.get('/fixture', (c) => c.html('<!doctype html><title>Fixture</title><h1>Fixture</h1>'));
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: app.fetch });
  if (!server.listening) await new Promise<void>((done) => server.once('listening', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  const originA = `http://127.0.0.1:${address.port}`,
    originB = `http://localhost:${address.port}`;
  for (const [index, origin] of [originA, originB].entries()) {
    const cwd = join(directory, `project-${index}`);
    mkdirSync(cwd);
    store.config.projects.push({
      id: randomUUID(),
      name: `Project ${index + 1}`,
      cwd,
      origins: [origin],
    });
  }
  const queue = new Queue(store);
  const sessions = store.config.projects.map((project) =>
    queue.agents.register({
      projectId: project.id,
      claim: randomUUID(),
      client: { name: 'Trae', version: 'fixture' },
    }),
  );
  const codex = queue.agents.register({
    projectId: store.config.projects[0]!.id,
    claim: randomUUID(),
    client: { name: 'Codex', version: 'fixture' },
  });
  app.route('/', createApp(store, queue, address.port));
  for (const name of ['manifest.json', 'panel.js', 'background.js']) {
    const file = join(extension, name);
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll('http://127.0.0.1:4318', originA));
  }
  const manifest = JSON.parse(readFileSync(join(extension, 'manifest.json'), 'utf8'));
  manifest.host_permissions.push(`${originB}/*`);
  writeFileSync(join(extension, 'manifest.json'), JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext(join(directory, 'profile'), {
    channel: 'chromium',
    headless: true,
    args: extensionBrowserArgs(extension),
  });
  try {
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const page = await context.newPage();
    await page.goto(`${originA}/fixture`);
    const panel = await context.newPage();
    panel.setDefaultTimeout(5000);
    await panel.setViewportSize({ width: 390, height: 850 });
    await panel.goto(`chrome-extension://${new URL(worker.url()).host}/panel.html`);
    await panel.getByRole('button', { name: '高级：手动配对', exact: true }).click();
    await panel.locator('#token').fill(store.config.token);
    await panel.locator('#connect').click();
    await page.bringToFront();
    await expect(panel.locator('#connection')).toHaveText('已连接');
    await panel.locator('#execution-settings').click();
    await expect(panel.getByRole('button', { name: '关闭自动发送', exact: true })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: '开启自动发送', exact: true })).toHaveCount(0);
    const guide = panel.getByRole('dialog', { name: '接收客户端', exact: true });
    await expect(guide).toContainText('复制到对应客户端的项目对话');
    await guide.getByRole('button', { name: '使用 Trae', exact: true }).click();
    await expect(guide).toBeHidden();
    await panel.locator('#instruction').fill('First request');
    await panel.locator('#submit').click();
    await expect.poll(() => store.jobs.length).toBe(1);
    expect(store.jobs[0]!.delivery).toBeUndefined();
    expect(store.jobs[0]!.recipient?.id).toBe(sessions[0]!.id);
    await expect(panel.locator('.status-queued')).toHaveText('待领取');
    await expect(panel.locator('#delivery-description')).toHaveText(
      '等待所选客户端领取；连接不会自动启动对话。',
    );
    await expect(panel.getByRole('button', { name: /重试发送|复制处理指令/ })).toHaveCount(0);
    await page.goto(`${originB}/fixture`);
    await page.bringToFront();
    await expect(panel.locator('#project-path')).toContainText('Project 2');
    await panel.locator('#instruction').fill('Second request');
    await panel.locator('#submit').click();
    await expect.poll(() => store.jobs.length).toBe(2);
    expect(
      store.jobs.every(
        (job) =>
          job.executor === 'mcp' && job.status === 'queued' && !job.delivery && !job.startedAt,
      ),
    ).toBe(true);
    expect(store.jobs[1]!.recipient?.id).toBe(sessions[1]!.id);
    await panel.reload();
    await page.bringToFront();
    await expect(panel.locator('#execution-summary')).toHaveText('Trae');
    await expect(panel.locator('.job')).toHaveCount(1);
    await expect(panel.locator('.job')).toContainText('Second request');
    await panel.locator('#language-toggle').click();
    await panel.getByRole('menuitemradio', { name: 'English', exact: true }).click();
    await expect(panel.locator('#delivery-description')).toHaveText(
      'Waiting for the selected client to claim. Connection does not start a chat.',
    );
    await expect(panel.locator('.job')).toContainText('Trae');
    await page.goto(`${originA}/fixture`);
    await page.bringToFront();
    await expect(panel.locator('#project-path')).toContainText('Project 1');
    await panel.locator('#execution-settings').click();
    await panel
      .getByRole('dialog', { name: 'Recipient', exact: true })
      .getByRole('button', { name: 'Use Codex', exact: true })
      .click();
    // Choosing a new default never silently moves an existing queued task.
    expect(store.jobs[0]!.recipient?.id).toBe(sessions[0]!.id);
    await panel.getByRole('button', { name: 'Reassign', exact: true }).click();
    await panel.locator(`#reassign-${store.jobs[0]!.id}`).click();
    await panel.getByRole('option', { name: 'Codex', exact: true }).click();
    await panel.getByRole('button', { name: 'Assign', exact: true }).click();
    await expect.poll(() => store.jobs[0]!.recipient?.id).toBe(codex.id);
    await panel.screenshot({
      path: test.info().outputPath('generic-mcp.png'),
      animations: 'disabled',
    });
  } finally {
    await context.close();
    await new Promise<void>((done) => {
      server.close(() => done());
      if ('closeAllConnections' in server) server.closeAllConnections();
    });
    rmSync(directory, { recursive: true, force: true });
  }
});
