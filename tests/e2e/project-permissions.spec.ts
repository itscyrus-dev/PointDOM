import { fixtureCli } from '../fixtures/cli.js';
import { extensionBrowserArgs } from './browser-args.js';
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

test('project page access keeps compact grant, denial and reopening states without host permission controls', async () => {
  test.setTimeout(90000);
  const directory = mkdtempSync(join(tmpdir(), 'pointdom-permissions-ui-'));
  const extension = join(directory, 'extension');
  cpSync(resolve('dist/extension'), extension, { recursive: true });
  const store = new Store(join(directory, 'state'));
  store.config.defaultExecutor = 'codex';
  const app = new Hono();
  app.get('/fixture', (c) => c.html('<!doctype html><title>访问测试</title><p>Fixture</p>'));
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: app.fetch });
  if (!server.listening) await new Promise<void>((done) => server.once('listening', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  const origin = `http://127.0.0.1:${address.port}`;
  store.config.projects.push({
    id: randomUUID(),
    cwd: directory,
    name: '权限测试',
    origins: [origin],
  });
  app.route(
    '/',
    createApp(store, new Queue(store, fixtureCli(directory, { available: [] })), address.port),
  );
  for (const name of ['manifest.json', 'panel.js', 'background.js']) {
    const file = join(extension, name);
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll('http://127.0.0.1:4318', origin));
  }
  const context = await chromium.launchPersistentContext(join(directory, 'profile'), {
    channel: 'chromium',
    headless: true,
    args: extensionBrowserArgs(extension),
  });
  try {
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const page = await context.newPage();
    await page.goto(`${origin}/fixture`);
    const panel = await context.newPage();
    panel.setDefaultTimeout(5000);
    await panel.setViewportSize({ width: 390, height: 780 });
    await panel.goto(`chrome-extension://${new URL(worker.url()).host}/panel.html`);
    await panel.getByRole('button', { name: '高级：手动配对', exact: true }).click();
    await panel.locator('#token').fill(store.config.token);
    await panel.locator('#connect').click();
    await page.bringToFront();
    await expect(panel.locator('#connection')).toHaveText('已连接');
    await panel.locator('#execution-settings').click();
    await expect(panel.locator('#executor, #project-confirmation')).toHaveCount(0);
    await expect(panel.getByRole('checkbox', { name: /Codex/ })).toHaveCount(0);
    await expect(
      panel
        .getByRole('dialog', { name: '执行工具', exact: true })
        .locator('.client-select:disabled'),
    ).toHaveCount(0);
    await panel.getByRole('dialog', { name: '执行工具', exact: true }).press('Escape');
    await panel.locator('#instruction').fill('Do not submit without a recipient');
    await expect(panel.locator('#submit')).toBeDisabled();
    expect(store.jobs).toHaveLength(0);
    const accessCard = panel.locator('.site-access-settings');
    const enable = panel.locator('#enable-page');
    await test.step('Inspect compact access states in both themes', async () => {
      await panel.locator('#connection-settings').click();
      await expect(enable).toHaveText('已启用');
      await expect(enable).toBeDisabled();
      for (const mode of ['浅色', '深色']) {
        await panel.locator('#theme-mode').getByRole('radio', { name: mode, exact: true }).click();
        await expect(accessCard).toContainText(origin);
        expect((await accessCard.boundingBox())!.height).toBeLessThan(110);
        await accessCard.screenshot({
          path: test.info().outputPath(`pointdom-project-access-${mode}.png`),
          animations: 'disabled',
        });
      }
    });
    await test.step('Handle denied and granted access requests', async () => {
      // Control only the permission replies in this isolated profile. The native fixture
      // host grant remains intact so a successful request can run the real injection path.
      await panel.evaluate((origin) => {
        const access = {
          granted: false,
          requests: [] as string[][],
          resolve: null as ((value: boolean) => void) | null,
        };
        Object.assign(globalThis, { __accessScenario: access });
        const contains = chrome.permissions.contains.bind(chrome.permissions);
        chrome.permissions.contains = async (permissions) =>
          permissions.origins?.includes(`${origin}/*`) ? access.granted : contains(permissions);
        chrome.permissions.request = async (permissions) => {
          access.requests.push(permissions.origins || []);
          return new Promise<boolean>((done) => {
            access.resolve = (value) => {
              access.granted = value;
              done(value);
            };
          });
        };
        window.dispatchEvent(new Event('focus'));
      }, origin);
      await expect(enable).toHaveText('启用访问');
      await expect(enable).toBeEnabled();
      for (const granted of [false, true]) {
        await enable.click();
        await expect(enable).toHaveText('启用中…');
        await expect(enable).toBeDisabled();
        await panel.evaluate((granted) => {
          const access = (
            globalThis as typeof globalThis & {
              __accessScenario: { resolve: (value: boolean) => void; requests: string[][] };
            }
          ).__accessScenario;
          access.resolve(granted);
        }, granted);
        if (!granted) {
          await expect(enable).toHaveText('启用访问');
          await expect(enable).toBeEnabled();
          await expect(panel.locator('#settings-notice')).toContainText('请允许访问当前网页');
        }
      }
      await expect(enable).toHaveText('已启用');
      await expect(enable).toBeDisabled();
      expect(
        await panel.evaluate(
          () =>
            (globalThis as typeof globalThis & { __accessScenario: { requests: string[][] } })
              .__accessScenario.requests,
        ),
      ).toEqual([[`${origin}/*`], [`${origin}/*`]]);
    });
    await test.step('Restore the persisted access state after reload', async () => {
      await panel.reload();
      await page.bringToFront();
      await panel.locator('#connection-settings').click();
      await expect(enable).toHaveText('已启用');
      await expect(enable).toBeDisabled();
    });
  } finally {
    const closed = new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
    if ('closeAllConnections' in server) server.closeAllConnections();
    await context.close();
    await closed;
    rmSync(directory, { recursive: true, force: true });
  }
});
