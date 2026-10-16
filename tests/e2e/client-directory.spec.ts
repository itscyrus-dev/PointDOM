import { test, expect, chromium } from '@playwright/test';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../../src/bridge/store.js';
import { Queue } from '../../src/bridge/queue.js';
import { createApp } from '../../src/bridge/server.js';
import { extensionBrowserArgs } from './browser-args.js';

test('client directory copies localized setup, remains offline until connected, and selects only live project sessions', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pointdom-client-directory-'));
  const extension = join(directory, 'extension');
  cpSync(resolve('dist/extension'), extension, { recursive: true });
  const store = new Store(join(directory, 'state'));
  const queue = new Queue(store),
    app = new Hono();
  app.get('/fixture', (c) =>
    c.html('<!doctype html><title>Private page title</title><h1>Fixture</h1>'),
  );
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: app.fetch });
  if (!server.listening) await new Promise<void>((done) => server.once('listening', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Missing fixture port');
  const origin = `http://127.0.0.1:${address.port}`,
    projectId = randomUUID(),
    foreignId = randomUUID();
  store.config.projects.push(
    { id: projectId, name: 'Fixture', cwd: directory, origins: [origin] },
    {
      id: foreignId,
      name: 'Other project',
      cwd: join(directory, 'other'),
      origins: ['http://localhost:9999'],
    },
  );
  queue.agents.register({
    projectId: foreignId,
    claim: randomUUID(),
    client: { name: 'Codex', version: 'fixture' },
  });
  app.route('/', createApp(store, queue, address.port));
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
    const page = await context.newPage();
    await page.goto(`${origin}/fixture`);
    const panel = await context.newPage();
    panel.setDefaultTimeout(6000);
    await panel.setViewportSize({ width: 390, height: 850 });
    const writes: string[] = [];
    let failCopy = true;
    await panel.exposeFunction('captureClientSetup', async (text: string) => {
      writes.push(text);
      if (failCopy) throw Error('Clipboard denied');
      await new Promise<void>((done) => {
        release = done;
      });
    });
    await panel.goto(`chrome-extension://${new URL(worker.url()).host}/panel.html`);
    await panel.evaluate(() => {
      navigator.clipboard.writeText = (text) =>
        (
          window as unknown as { captureClientSetup: (text: string) => Promise<void> }
        ).captureClientSetup(text);
      // This fixture hosts the panel in an inactive tab. Simulate a visible side panel
      // so its real polling loop runs while the project tab remains the active scope.
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    });
    await panel.getByRole('button', { name: '高级：手动配对', exact: true }).click();
    await panel.locator('#token').fill(store.config.token);
    await panel.locator('#connect').click();
    await page.bringToFront();
    await panel.locator('#instruction').fill('Keep my draft');
    await expect(panel.locator('#submit')).toBeDisabled();
    await panel.locator('#execution-settings').click();
    const guide = panel.getByRole('dialog', { name: '接收客户端', exact: true });
    const trae = guide.locator('[data-client="trae"]');
    await expect(guide.locator('.client-entry')).toHaveCount(6);
    await expect(guide.locator('[data-client="codex"] .client-status')).toHaveText('未连接');
    await expect(trae.locator('.client-status')).toHaveText('未连接');
    await expect(trae.getByRole('button', { name: '使用 Trae', exact: true })).toHaveCount(0);
    const copy = trae.getByRole('button', { name: '复制 Trae 接入指令', exact: true });
    await copy.click();
    await expect(trae.getByRole('alert')).toHaveText('复制失败，请重试。');
    failCopy = false;
    await copy.click();
    await expect(copy).toBeDisabled();
    await expect.poll(() => Boolean(release)).toBe(true);
    release!();
    await expect(copy).toHaveText('已复制');
    await expect(trae.locator('.client-status')).toHaveText('未连接');
    expect(writes.at(-1)).toContain('docs/agents/TRAE.md');
    expect(writes.at(-1)).toContain('当前项目');
    expect(writes.at(-1)).toContain('connection.id');
    expect(writes.at(-1)).toContain('重启或重连');
    for (const privateText of [
      store.config.token,
      directory,
      origin,
      'Private page title',
      'Keep my draft',
    ])
      expect(writes.at(-1)).not.toContain(privateText);
    expect(store.jobs).toHaveLength(0);
    await guide.screenshot({
      path: test.info().outputPath('client-directory-dark.png'),
      animations: 'disabled',
    });
    await guide.press('Escape');
    await panel.locator('#language-toggle').click();
    await panel.getByRole('menuitemradio', { name: 'English', exact: true }).click();
    await panel.getByRole('radio', { name: 'Light', exact: true }).click();
    await panel.locator('#execution-settings').click();
    const englishGuide = panel.getByRole('dialog', { name: 'Recipient', exact: true });
    const codex = englishGuide.locator('[data-client="codex"]');
    release = undefined;
    await codex.getByRole('button', { name: 'Copy Codex setup instruction', exact: true }).click();
    await expect.poll(() => Boolean(release)).toBe(true);
    release!();
    await expect(codex.getByRole('button')).toHaveText('Copied');
    expect(writes.at(-1)).toContain('docs/agents/CODEX.md');
    expect(writes.at(-1)).toContain('connection.id');
    expect(writes.at(-1)).not.toMatch(/\p{Script=Han}/u);
    await expect(englishGuide.locator('[data-client="trae"] .client-status')).toHaveText(
      'Not connected',
    );
    const claim = randomUUID();
    const connected = queue.agents.register({
      projectId,
      claim,
      client: { name: 'trae-coding-agent', version: 'fixture' },
    });
    const available = englishGuide.locator('[data-client="trae"]');
    await expect(available.locator('.client-status')).toHaveText('Available');
    await expect(available.getByRole('button', { name: /Copy/ })).toHaveCount(0);
    await panel.setViewportSize({ width: 280, height: 740 });
    await expect
      .poll(() => panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await englishGuide.screenshot({
      path: test.info().outputPath('client-directory-light-narrow.png'),
      animations: 'disabled',
    });
    await available.getByRole('button', { name: 'Use Trae', exact: true }).click();
    await expect(englishGuide).toBeHidden();
    await expect(panel.locator('#instruction')).toHaveValue('Keep my draft');
    await expect(panel.locator('#submit')).toBeEnabled();
    await panel.locator('#submit').click();
    await expect.poll(() => store.jobs[0]?.recipient?.id).toBe(connected.id);
    await panel.locator('#execution-settings').click();
    queue.agents.disconnect(projectId, claim);
    await expect(englishGuide.locator('[data-client="trae"] .client-status')).toHaveText(
      'Not connected',
    );
    expect(store.jobs[0]!.recipient?.id).toBe(connected.id);
    expect(store.jobs[0]!.status).toBe('queued');
  } finally {
    release?.();
    await context.close();
    await new Promise<void>((done) => {
      server.close(() => done());
      if ('closeAllConnections' in server) server.closeAllConnections();
    });
    rmSync(directory, { recursive: true, force: true });
  }
});
