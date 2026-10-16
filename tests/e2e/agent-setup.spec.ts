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
test('CLI selection works independently of MCP configuration and persists globally', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pointdom-cli-settings-'));
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
  app.route('/', createApp(store, queue, address.port));
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
    await panel
      .locator('.pairing-settings')
      .screenshot({ path: test.info().outputPath('pairing-spacing-dark.png') });
    await panel.setViewportSize({ width: 280, height: 820 });
    await panel
      .locator('.pairing-settings')
      .screenshot({ path: test.info().outputPath('pairing-spacing-narrow.png') });
    await panel.setViewportSize({ width: 390, height: 820 });
    await panel.locator('#token').fill(store.config.token);
    await panel.locator('#connect').click();
    await expect(panel.locator('.agent-setup-settings')).toHaveCount(0);
    await expect(panel.locator('#connection-view')).not.toContainText('无需复制到客户端');
    const site = await context.newPage();
    await site.goto(origin + '/fixture');
    await panel.goto(`chrome-extension://${new URL(worker.url()).host}/panel.html`);
    await site.bringToFront();
    await expect(panel.getByRole('button', { name: /复制 MCP|复制监听/ })).toHaveCount(0);
    await panel.locator('#execution-settings').click();
    await expect(panel.locator('#delivery-guide')).toHaveCount(0);
    const dialog = panel.getByRole('dialog', { name: '执行工具' });
    await expect(dialog.locator('.client-entry')).toHaveCount(2);
    await expect(dialog).not.toContainText('使用本机 CLI 的账号和模型。');
    await dialog.getByRole('button', { name: '重新检测', exact: true }).click();
    await expect(dialog.locator('.client-entry')).toHaveCount(2);
    await expect(dialog.getByRole('button', { name: '使用 Trae', exact: true })).toHaveCount(0);
    const claude = dialog.getByRole('button', { name: '使用 Claude Code', exact: true });
    await expect(claude).toBeEnabled();
    const before = await claude.boundingBox();
    await claude.hover();
    expect(await claude.boundingBox()).toEqual(before);
    await panel.screenshot({ path: test.info().outputPath('cli-picker-dark.png') });
    await claude.click();
    await expect(panel.locator('#execution-summary')).toHaveText('Claude Code');
    expect(store.config.defaultExecutor).toBe('claude');
    expect(new Store(store.directory).config.defaultExecutor).toBe('claude');
    await panel.reload();
    await expect(panel.locator('#execution-summary')).toHaveText('Claude Code');
    await panel.locator('#language-toggle').click();
    await panel.getByRole('menuitemradio', { name: 'English', exact: true }).click();
    await expect(panel.getByRole('heading', { name: 'CLI settings', exact: true })).toHaveCount(0);
    await panel.setViewportSize({ width: 280, height: 820 });
    await panel.locator('#execution-settings').click();
    expect(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await panel.screenshot({ path: test.info().outputPath('cli-picker-narrow.png') });
  } finally {
    queue.stop();
    await context.close();
    server.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
