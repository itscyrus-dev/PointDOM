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
import { fixtureDelivery } from '../delivery-fixture.js';

test('project permission saves close the popover only on success and preserve failures for retry', async () => {
  test.setTimeout(90000);
  const directory = mkdtempSync(join(tmpdir(), 'pointdom-permissions-ui-'));
  const extension = join(directory, 'extension');
  cpSync(resolve('dist/extension'), extension, { recursive: true });
  const store = new Store(join(directory, 'state'));
  store.config.defaultExecutor = 'codex';
  const app = new Hono();
  let failSave = false;
  let holdSave = false;
  let releaseSave: (() => void) | undefined;
  app.get('/fixture', (c) => c.html('<!doctype html><title>权限测试</title><p>Fixture</p>'));
  app.use('/api/projects/*/permissions', async (c, next) => {
    if (holdSave && c.req.method === 'POST') {
      await new Promise<void>((done) => {
        releaseSave = done;
      });
    }
    if (failSave && c.req.method === 'POST')
      return c.json({ error: '测试：保存失败，请重试' }, 503);
    await next();
  });
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
  app.route('/', createApp(store, new Queue(store), address.port, fixtureDelivery));
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
    const form = panel.getByRole('region', { name: '项目权限' });
    const network = form.getByRole('checkbox', { name: '允许 Codex 任务联网' });
    const control = form.locator('.checkbox__control');
    await test.step('Pair and open project permissions', async () => {
      await panel.locator('#token').fill(store.config.token);
      await panel.locator('#connect').click();
      await page.bringToFront();
      await expect(panel.locator('#connection')).toHaveText('已连接');
      await panel.locator('#instruction').fill('保留这份批注草稿');
      await panel.locator('#execution-settings').click();
    });
    await test.step('Save a pending request and restore focus', async () => {
      await control.click();
      await expect(network).toBeChecked();
      await expect.soft(control.locator('svg')).toHaveCSS('width', '10px');
      await panel.getByText('允许 Codex 任务联网', { exact: true }).click();
      await expect(network).not.toBeChecked();
      await control.click();
      await expect(network).toBeChecked();
      const save = form.getByRole('button', { name: '保存', exact: true });
      holdSave = true;
      await save.click();
      await expect(form.getByRole('button', { name: '保存中…', exact: true })).toBeDisabled();
      await expect(network).toBeDisabled();
      await expect(form.locator('#project-confirmation')).toBeDisabled();
      await expect.poll(() => Boolean(releaseSave)).toBe(true);
      holdSave = false;
      releaseSave!();
      await expect.poll(() => store.config.projects[0]?.permissions?.codexNetwork).toBe(true);
      await expect(form).toBeHidden();
      await expect(panel.locator('#execution-settings')).toBeFocused();
      await expect(panel.locator('#instruction')).toHaveValue('保留这份批注草稿');
      await expect(panel.locator('#notice')).toContainText('项目权限已保存');
    });
    await test.step('Preserve failed edits and retry without losing the draft', async () => {
      await panel.locator('#execution-settings').click();
      await expect(network).toBeChecked();
      await expect(form.getByRole('button', { name: '保存', exact: true })).toBeDisabled();
      await control.click();
      failSave = true;
      await form.getByRole('button', { name: '保存', exact: true }).click();
      await expect(form.getByRole('alert')).toContainText('保存失败');
      await expect(network).not.toBeChecked();
      expect(store.config.projects[0]?.permissions?.codexNetwork).toBe(true);
      failSave = false;
      await form.getByRole('button', { name: '保存', exact: true }).click();
      await expect(form).toBeHidden();
      await expect.poll(() => store.config.projects[0]?.permissions?.codexNetwork).toBe(false);
      await panel.locator('#execution-settings').click();
      await expect(network).not.toBeChecked();
      await control.click();
      await form.getByRole('button', { name: '保存', exact: true }).click();
      await expect(form).toBeHidden();
      await expect.poll(() => store.config.projects[0]?.permissions?.codexNetwork).toBe(true);
      await expect(panel.locator('#instruction')).toHaveValue('保留这份批注草稿');
      await panel.screenshot({
        path: test.info().outputPath('pointdom-permissions-save-closed.png'),
        animations: 'disabled',
      });
    });
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
    releaseSave?.();
    const closed = new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
    if ('closeAllConnections' in server) server.closeAllConnections();
    await context.close();
    await closed;
    rmSync(directory, { recursive: true, force: true });
  }
});
