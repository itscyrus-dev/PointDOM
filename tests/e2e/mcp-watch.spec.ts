import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { z } from 'zod';
import { symlinkSync, realpathSync } from 'node:fs';
import { test, expect, chromium } from '@playwright/test';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../../src/bridge/store.js';
import { Queue } from '../../src/bridge/queue.js';
import { createApp } from '../../src/bridge/server.js';
import { randomUUID } from 'node:crypto';
import { fixtureCli } from '../fixtures/cli.js';
import { extensionBrowserArgs } from './browser-args.js';
test('MCP listening executes consecutive assigned tasks and reports true idle/disconnected state', async () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'pointdom-cli-settings-')));
  const extension = join(directory, 'extension');
  cpSync(resolve('dist/extension'), extension, { recursive: true });
  const store = new Store(join(directory, 'state'));
  const queue = new Queue(store, fixtureCli(directory, { available: ['codex', 'claude'] }));
  const app = new Hono();
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: app.fetch });
  if (!server.listening) await new Promise<void>((done) => server.once('listening', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Missing port');
  const origin = `http://127.0.0.1:${address.port}`;
  app.get('/fixture', (c) => c.html('<h1>Fixture</h1>'));
  store.config.projects.push({
    id: randomUUID(),
    name: 'Fixture',
    cwd: directory,
    origins: [origin],
  });
  app.route('/', createApp(store, queue, address.port, resolve('dist/bridge/mcp.js')));
  expect((await fetch(origin + '/api/clis')).status).toBe(403);
  for (const name of ['manifest.json', 'panel.js', 'background.js']) {
    const file = join(extension, name);
    const text = readFileSync(file, 'utf8').replaceAll('http://127.0.0.1:4318', origin);
    if (name === 'manifest.json') {
      const manifest = JSON.parse(text);
      manifest.host_permissions.push(origin + '/*');
      writeFileSync(file, JSON.stringify(manifest));
    } else writeFileSync(file, text);
  }
  store.saveConfig();
  const entry = join(directory, 'mcp.mjs');
  writeFileSync(
    entry,
    readFileSync(resolve('dist/bridge/mcp.js'), 'utf8').replaceAll(
      '127.0.0.1:4318',
      `127.0.0.1:${address.port}`,
    ),
  );
  symlinkSync(resolve('node_modules'), join(directory, 'node_modules'));
  const mcpClient = new Client({ name: 'Trae', version: 'fixture' });
  await mcpClient.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [entry],
      env: { ...(process.env as Record<string, string>), PAGEPATCH_HOME: store.directory },
    }),
  );
  const context = await chromium.launchPersistentContext(join(directory, 'profile'), {
    channel: 'chromium',
    headless: true,
    args: extensionBrowserArgs(extension),
  });
  try {
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 390, height: 820 });
    await panel.emulateMedia({ reducedMotion: 'reduce' });
    await panel.goto(`chrome-extension://${new URL(worker.url()).host}/panel.html?settings=1`);
    await panel.getByRole('button', { name: '高级：手动配对', exact: true }).click();
    await panel.locator('#token').fill(store.config.token);
    await panel.locator('#connect').click();
    await expect(panel.getByRole('button', { name: '复制 MCP 配置', exact: true })).toBeVisible();
    await panel
      .locator('.mcp-settings')
      .screenshot({ path: test.info().outputPath('mcp-settings.png'), animations: 'disabled' });
    const project = store.config.projects[0]!;
    await mcpClient.callTool({ name: 'pointdom_bind_project', arguments: { path: project.cwd } });
    const client = queue.agents.list(project.id)[0]!;
    const site = await context.newPage();
    await site.goto(origin + '/fixture');
    await panel.goto(`chrome-extension://${new URL(worker.url()).host}/panel.html`);
    await site.bringToFront();
    // A side panel remains visible beside the active site; emulate that visibility for this isolated tab.
    await panel.evaluate(() =>
      Object.defineProperty(document, 'visibilityState', {
        get: () => 'visible',
        configurable: true,
      }),
    );
    await panel.locator('#execution-settings').click();
    await panel.getByRole('button', { name: '使用 MCP 监听', exact: true }).click();
    await panel.locator('#execution-settings').click();
    await panel.getByRole('button', { name: '选择 Trae', exact: true }).click();
    await expect(panel.locator('#mcp-state')).toHaveText('已连接，未监听');
    await panel.locator('#instruction').fill('Fixture first task');
    await expect(panel.locator('#submit')).toBeDisabled();
    const mcp = async (path: string, body: Record<string, unknown>) => {
      const parts = path.split('/');
      const name = path === '/wait' ? 'pointdom_wait_for_task' : `pointdom_${parts[3]}_task`;
      const response = await mcpClient.callTool({
        name,
        arguments: { ...body, ...(path === '/wait' ? {} : { taskId: parts[2] }) },
      });
      const result = z
        .object({
          isError: z.boolean().optional(),
          content: z.array(z.object({ type: z.literal('text'), text: z.string() })),
        })
        .parse(response);
      expect(result.isError).not.toBe(true);
      return JSON.parse(result.content[0]!.text);
    };
    for (const n of [1, 2]) {
      const waiting = mcp('/wait', { projectId: project.id });
      await expect(panel.locator('#mcp-state')).toHaveText('监听中');
      if (n === 1) {
        await panel.locator('#execution-settings').click();
        await expect(panel.getByRole('dialog', { name: '执行工具' })).toBeVisible();
        await panel.screenshot({
          path: test.info().outputPath('mcp-listening-menu.png'),
          animations: 'disabled',
        });
        await panel.keyboard.press('Escape');
      }
      await panel.locator('#instruction').fill('Fixture task ' + n);
      if (n === 1) {
        // The bridge accepts the task but the browser loses the response.
        let lost = false;
        await panel.route('**/api/jobs', async (route) => {
          if (!lost && route.request().method() === 'POST') {
            lost = true;
            await route.fetch();
            await route.abort();
          } else await route.continue();
        });
      }
      await panel.locator('#submit').click();
      const { taskId } = await waiting;
      const job = store.jobs.find((j) => j.id === taskId)!;
      expect(job.recipient?.id).toBe(client.id);
      if (n === 1) {
        await expect(panel.locator('#notice')).toContainText('提交未确认');
        await expect(panel.locator('#mcp-state')).toHaveText('已连接，未监听');
        await expect(panel.locator('#submit')).toBeEnabled();
        await panel.locator('#submit').click();
        await expect(panel.locator('#instruction')).toHaveValue('');
        expect(store.jobs).toHaveLength(1);
        expect(store.jobs[0]!.id).toBe(taskId);
      }
      await mcp(`/tasks/${taskId}/claim`, { projectId: project.id, agent: 'fixture' });
      await expect(panel.locator('#mcp-state')).toHaveText('执行中');
      writeFileSync(join(directory, 'verified.txt'), String(n));
      await mcp(`/tasks/${taskId}/progress`, {
        projectId: project.id,
        stepId: 'verify',
        message: 'Verified isolated file',
      });
      await mcp(`/tasks/${taskId}/report`, {
        projectId: project.id,
        outcome: 'completed',
        summary: 'Fixture completed ' + n,
        files: ['verified.txt'],
        verification: 'Read back: ' + readFileSync(join(directory, 'verified.txt'), 'utf8'),
      });
      await expect(panel.locator('.job[data-status="completed"]')).toHaveCount(n);
    }
    await expect(panel.locator('#mcp-state')).toHaveText('已连接，未监听');
    const abort = new AbortController();
    const cancelled = mcpClient
      .callTool(
        { name: 'pointdom_wait_for_task', arguments: { projectId: project.id } },
        undefined,
        { signal: abort.signal },
      )
      .then(
        () => 'resolved',
        () => 'cancelled',
      );
    await expect(panel.locator('#mcp-state')).toHaveText('监听中');
    abort.abort();
    expect(await cancelled).toBe('cancelled');
    await expect(panel.locator('#mcp-state')).toHaveText('已连接，未监听');
    await panel.reload();
    await expect(panel.locator('#mcp-state')).toHaveText('已连接，未监听');
    await panel.locator('#instruction').fill('Must remain a draft');
    await mcpClient.close();
    await expect(panel.locator('#mcp-state')).toHaveText('已断开');
    await expect(panel.locator('#submit')).toBeDisabled();
    await expect(panel.locator('#instruction')).toHaveValue('Must remain a draft');
    await panel.setViewportSize({ width: 280, height: 820 });
    await panel.screenshot({ path: test.info().outputPath('mcp-disconnected-narrow.png') });
    expect(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await mcpClient.close().catch(() => {});
    queue.stop();
    await context.close();
    server.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
