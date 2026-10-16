import { test, expect, chromium } from '@playwright/test';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store } from '../../src/bridge/store.js';
import { Queue } from '../../src/bridge/queue.js';
import { createApp } from '../../src/bridge/server.js';
import { extensionBrowserArgs } from './browser-args.js';

declare global {
  interface Window {
    writeSetupClipboard: (text: string) => Promise<void>;
  }
}

test('paired settings hand off project and MCP setup without forwarding credentials or running commands', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pointdom-agent-setup-'));
  const extension = join(directory, 'extension');
  cpSync(resolve('dist/extension'), extension, { recursive: true });
  const store = new Store(join(directory, 'state'));
  const app = new Hono();
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: app.fetch });
  if (!server.listening) await new Promise<void>((done) => server.once('listening', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  const origin = `http://127.0.0.1:${address.port}`;
  app.route('/', createApp(store, new Queue(store), address.port));
  for (const name of ['manifest.json', 'panel.js', 'background.js']) {
    const file = join(extension, name);
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll('http://127.0.0.1:4318', origin));
  }
  const context = await chromium.launchPersistentContext(join(directory, 'profile'), {
    channel: 'chromium',
    headless: true,
    args: extensionBrowserArgs(extension),
  });
  let release: (() => void) | undefined;
  try {
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 390, height: 820 });
    const writes: string[] = [];
    let rejectCopy = true;
    await panel.exposeFunction('writeSetupClipboard', async (text: string) => {
      writes.push(text);
      if (rejectCopy) throw new Error('Fixture: clipboard denied');
      await new Promise<void>((done) => {
        release = done;
      });
    });
    await panel.goto(`chrome-extension://${new URL(worker.url()).host}/panel.html?settings=1`);
    await panel.evaluate(() => {
      navigator.clipboard.writeText = (text) => window.writeSetupClipboard(text);
    });
    const guide = panel.locator('.agent-setup-settings');
    const copy = panel.locator('#copy-agent-setup');
    await expect(guide).toHaveCount(0);
    await panel.getByRole('button', { name: '高级：手动配对', exact: true }).click();
    await panel.locator('#token').fill(store.config.token);
    await panel.locator('#connect').click();
    await expect(guide).toBeVisible();
    await expect(guide).toContainText('Trae');
    await copy.click();
    await expect(guide.getByRole('alert')).toHaveText('复制失败，请重试。');
    await expect(copy).toBeEnabled();
    rejectCopy = false;
    await copy.click();
    await expect(copy).toBeDisabled();
    await expect.poll(() => Boolean(release)).toBe(true);
    expect(writes).toHaveLength(2);
    release!();
    await expect(copy).toHaveText('已复制接入指令');
    await expect(guide.getByRole('alert')).toHaveCount(0);
    await expect(guide.getByRole('status')).toContainText('粘贴并发送');
    expect(writes[1]).toContain('请完成当前项目的 PointDOM 接入');
    expect(writes[1]).not.toContain('Finish connecting PointDOM');
    expect(writes[1]).toContain('pdo link --path');
    expect(writes[1]).toContain('pdo connect --path');
    expect(writes[1]).toContain('.trae/mcp.json');
    expect(writes[1]).toContain('pointdom_list_tasks');
    expect(writes[1]).toContain('connection.id');
    expect(writes[1]).toContain('不切到 IDE');
    expect(writes[1]).not.toContain(store.config.token);
    expect(writes[1]).not.toContain(directory);
    expect(writes[1]).not.toContain(origin);
    expect(store.config.projects).toHaveLength(0);
    await guide.screenshot({ path: test.info().outputPath('agent-setup-dark.png') });
    await panel.locator('#language-toggle').click();
    await panel.getByRole('menuitemradio', { name: 'English', exact: true }).click();
    await expect(copy).toHaveText('Copy setup instruction');
    release = undefined;
    await copy.click();
    await expect.poll(() => Boolean(release)).toBe(true);
    release!();
    await expect(copy).toHaveText('Setup instruction copied');
    expect(writes[2]).toContain('Finish connecting PointDOM');
    expect(writes[2]).toContain('connection.id');
    expect(writes[2]).not.toContain('请完成当前项目');
    await panel.getByRole('radio', { name: 'Light', exact: true }).click();
    await panel.setViewportSize({ width: 280, height: 740 });
    await expect
      .poll(() => panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await guide.screenshot({ path: test.info().outputPath('agent-setup-light-narrow.png') });
  } finally {
    release?.();
    await context.close();
    const closed = new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
    if ('closeAllConnections' in server) server.closeAllConnections();
    await closed;
    rmSync(directory, { recursive: true, force: true });
  }
});
