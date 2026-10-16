import { extensionBrowserArgs } from './browser-args.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { test, expect, chromium } from '@playwright/test';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import {
  mkdtempSync,
  mkdirSync,
  realpathSync,
  cpSync,
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { Store } from '../../src/bridge/store.js';
import { Queue } from '../../src/bridge/queue.js';
import { createApp } from '../../src/bridge/server.js';

test('packaged React + HeroUI extension preserves drafts, preferences and the real MCP task lifecycle', async () => {
  test.setTimeout(90000);
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'pagepatch-extension-')));
  const extension = join(directory, 'PointDOM Extension');
  const unpacked = join(directory, 'versions/fixture/dist/extension');
  mkdirSync(join(directory, 'versions/fixture/dist'), { recursive: true });
  cpSync(resolve('dist/extension'), unpacked, { recursive: true });
  symlinkSync(unpacked, extension, 'dir');
  // Only the isolated test copy gets a fixture-site grant. Distribution grants project sites on user action.
  const manifest = JSON.parse(readFileSync(join(extension, 'manifest.json'), 'utf8'));
  expect(manifest.permissions).not.toContain('tabs');
  expect(manifest.host_permissions).toEqual([
    'http://127.0.0.1:4318/*',
    'https://api.github.com/*',
  ]);
  manifest.host_permissions.push('http://127.0.0.1:5175/*');
  writeFileSync(join(extension, 'manifest.json'), JSON.stringify(manifest));
  const projectDirectory = realpathSync(mkdtempSync(join(tmpdir(), 'pagepatch-project-')));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: projectDirectory, stdio: 'pipe' });
  git('init');
  git('config', 'user.name', 'PagePatch Test');
  git('config', 'user.email', 'test@example.invalid');
  writeFileSync(join(projectDirectory, 'button.css'), 'button { height: 32px; }');
  git('add', '.');
  git('commit', '-m', 'initial');
  const store = new Store(join(directory, 'state'));
  expect(store.config.defaultExecutor).toBe('mcp');
  store.config.projects.push({
    id: randomUUID(),
    name: '测试项目',
    cwd: projectDirectory,
    origins: ['http://127.0.0.1:5175', 'http://localhost:5175'],
  });
  store.saveConfig();
  const queue = new Queue(store);
  const reservation = createServer();
  await new Promise<void>((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const address = reservation.address();
  if (!address || typeof address === 'string') throw new Error('fixture port unavailable');
  const bridgePort = address.port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const fixtureAddress = `127.0.0.1:${bridgePort}`;
  const rewritePort = (text: string) => text.replaceAll('127.0.0.1:4318', fixtureAddress);
  writeFileSync(join(extension, 'manifest.json'), rewritePort(JSON.stringify(manifest)));
  for (const name of ['panel.js', 'background.js'])
    writeFileSync(join(extension, name), rewritePort(readFileSync(join(extension, name), 'utf8')));
  const mcpEntry = join(directory, 'mcp.mjs');
  writeFileSync(mcpEntry, rewritePort(readFileSync(resolve('dist/bridge/mcp.js'), 'utf8')));
  symlinkSync(resolve('node_modules'), join(directory, 'node_modules'));
  const app = new Hono();
  let codexCalls = 0;
  app.use('/api/models', async (_c, next) => {
    codexCalls++;
    await next();
  });
  app.use('/api/status', async (_c, next) => {
    codexCalls++;
    await next();
  });
  app.route('/', createApp(store, queue, bridgePort));
  const bridge = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: bridgePort });
  const site = serve({
    hostname: '127.0.0.1',
    port: 5175,
    fetch: () =>
      new Response(
        '<!doctype html><title>测试商店</title><button id="send" style="height:32px" onclick="this.textContent=\'误触\'">发送</button><button id="secondary">取消</button>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      ),
  });
  const context = await chromium.launchPersistentContext(join(directory, 'profile'), {
    channel: 'chromium',
    headless: true,
    args: extensionBrowserArgs(extension),
  });
  const mcpClient = new Client({ name: 'isolated-agent-fixture', version: '1.0.0' });
  context.setDefaultTimeout(7000);
  try {
    await mcpClient.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [mcpEntry, '--project', projectDirectory],
        env: { ...process.env, PAGEPATCH_HOME: store.directory },
      }),
    );
    console.log('Extension test browser launched');
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent('serviceworker', { timeout: 10000 }));
    console.log('Extension worker ready');
    const id = new URL(worker.url()).host;
    console.log('Worker URL', worker.url());
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:5175');
    const panel = await context.newPage();
    const runtimeErrors: string[] = [];
    panel.on('pageerror', (error) => runtimeErrors.push(error.message));
    await panel.goto(`chrome-extension://${id}/panel.html`);
    console.log('Panel loaded');
    await expect(panel.locator('#connection')).toHaveAttribute('data-state', 'offline');
    await panel.setViewportSize({ width: 390, height: 850 });
    await panel.locator('.app-header').screenshot({
      path: test.info().outputPath('pointdom-header-offline.png'),
      animations: 'disabled',
    });
    await panel.evaluate(() =>
      chrome.storage.local.set({
        pointdomPreferences: {
          version: 1,
          mode: 'dark',
          accent: 'violet',
          language: 'zh-CN',
          shape: 'soft',
        },
      }),
    );
    await panel.reload();
    await panel.getByRole('button', { name: '高级：手动配对', exact: true }).click();
    await expect(panel.locator('#token')).toBeVisible();
    await panel.locator('#token').fill('invalid-pairing-code');
    await panel.locator('#connect').click();
    await expect(panel.locator('#connection')).toHaveAttribute('data-state', 'offline');
    await expect(panel.locator('#pairing-status')).toHaveCount(0);
    expect(
      await panel.evaluate(async () =>
        Boolean((await chrome.storage.local.get('bridgeToken')).bridgeToken),
      ),
    ).toBe(false);
    await panel.locator('#token').fill(store.config.token);
    await panel.locator('#connect').click();
    console.log('Extension paired');
    await page.bringToFront();
    await expect(panel.locator('.brand #connection')).toHaveText('已连接');
    const optionsFor = (url: string) =>
      worker.evaluate(async (targetUrl) => {
        const [tab] = await chrome.tabs.query({ url: targetUrl });
        if (tab?.id === undefined) throw new Error('Missing fixture tab');
        return chrome.sidePanel.getOptions({ tabId: tab.id });
      }, url);
    await expect.poll(async () => (await optionsFor('http://127.0.0.1:5175/*')).enabled).toBe(true);
    expect((await worker.evaluate(() => chrome.sidePanel.getOptions({}))).enabled).toBe(false);
    const unrelated = await context.newPage();
    await unrelated.goto(`http://${fixtureAddress}/unrelated`);
    await unrelated.bringToFront();
    await expect
      .poll(async () => (await optionsFor(`http://${fixtureAddress}/*`)).enabled)
      .toBe(false);
    await expect(panel.locator('#instruction')).toHaveCount(0);
    await expect(panel.locator('#jobs')).toHaveCount(0);
    expect(
      await unrelated.evaluate(() => document.querySelectorAll('[data-pagepatch]').length),
    ).toBe(0);
    await unrelated.close();
    await page.bringToFront();
    await expect(panel.locator('#instruction')).toBeVisible();
    await panel.locator('#instruction').fill('切换网页后保留的草稿');
    await page.goto(`http://${fixtureAddress}/unrelated`);
    await expect(panel.locator('#instruction')).toHaveCount(0);
    await expect
      .poll(async () => (await optionsFor(`http://${fixtureAddress}/*`)).enabled)
      .toBe(false);
    await page.goto('http://127.0.0.1:5175');
    await expect(panel.locator('#instruction')).toHaveValue('切换网页后保留的草稿');
    await panel.locator('#instruction').fill('');
    const optionsOpened = context.waitForEvent('page');
    await worker.evaluate(() => chrome.runtime.openOptionsPage());
    const options = await optionsOpened;
    await expect(options).toHaveURL(`chrome-extension://${id}/panel.html?settings=1`);
    await expect(options.locator('#pairing-status')).toHaveText('已添加');
    await expect(options.locator('#instruction')).toHaveCount(0);
    await expect(options.locator('#jobs')).toHaveCount(0);
    await options.close();
    await page.bringToFront();
    // Reopening preserves the saved pairing even while the local service is unavailable.
    await panel.route(`http://${fixtureAddress}/**`, (route) => route.abort());
    await panel.reload();
    await expect(panel.locator('#connection')).toHaveAttribute('data-state', 'offline');
    await expect(panel.locator('#pairing-status')).toHaveText('已添加');
    await expect(panel.locator('#token')).toHaveCount(0);
    await expect(panel.locator('#reconnect')).toBeVisible();
    await panel.screenshot({
      path: test.info().outputPath('pointdom-pairing-saved-offline.png'),
      animations: 'disabled',
    });
    await panel.unroute(`http://${fixtureAddress}/**`);
    await panel.locator('#reconnect').click();
    await expect(panel.locator('#connection')).toHaveText('已连接');
    // The test manifest grants 127.0.0.1 only. localhost reproduces the real first-use
    // state where Chrome withholds Tab.url, without adding a broad tabs permission.
    await page.goto('http://localhost:5175');
    await panel.reload();
    await page.bringToFront();
    await expect(panel.locator('#connection')).toHaveText('已连接');
    expect(
      await panel.evaluate(async () =>
        Boolean((await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.url),
      ),
    ).toBe(false);
    await expect(panel.locator('#instruction')).toHaveCount(0);
    await expect(panel.locator('#site-origin')).toBeVisible();
    await expect(panel.locator('#project-field')).toBeHidden();
    await expect(panel.locator('#enable-page')).toBeDisabled();
    await panel.locator('#site-origin').click();
    await panel
      .getByRole('option', { name: '测试项目 · http://localhost:5175', exact: true })
      .click();
    await expect(panel.locator('#enable-page')).toBeEnabled();
    await expect(panel.locator('#settings-notice')).toBeHidden();
    await panel.screenshot({
      path: test.info().outputPath('pointdom-first-page-access.png'),
      animations: 'disabled',
    });
    const openedProject = context.waitForEvent('page');
    await panel.locator('#open-project-site').click();
    const linkedPage = await openedProject;
    await expect(linkedPage).toHaveURL('http://localhost:5175/');
    await linkedPage.close();
    await page.goto('http://127.0.0.1:5175');
    await page.bringToFront();
    await panel.reload();
    await page.bringToFront();
    await expect(panel.locator('#connection')).toHaveText('已连接');
    await panel.setViewportSize({ width: 390, height: 850 });
    await panel.locator('#execution-settings').click();
    await panel
      .getByRole('dialog', { name: '接收客户端', exact: true })
      .getByRole('button', { name: '使用 isolated-agent-fixture', exact: true })
      .click();
    const executionDialog = panel.getByRole('dialog', { name: '接收客户端', exact: true });
    const openExecution = async () => {
      if (!(await executionDialog.isVisible())) await panel.locator('#execution-settings').click();
    };
    const closeExecution = async () => {
      if (await executionDialog.isVisible()) {
        await executionDialog.press('Escape');
        await expect(executionDialog).toBeHidden();
      }
    };
    await expect(panel.locator('#execution-summary')).toHaveText('isolated-agent-fixture');
    await panel.locator('#execution-settings').hover();
    await panel.screenshot({
      path: test.info().outputPath('pointdom-compact-executor-hover.png'),
      animations: 'disabled',
    });
    expect(codexCalls).toBe(0);
    await panel.screenshot({ path: test.info().outputPath('pointdom-empty.png') });
    // The header control toggles in place, with distinct icons and accessible state.
    const settingsToggle = panel.locator('#connection-settings');
    await expect(settingsToggle).toHaveAttribute('aria-expanded', 'false');
    const closedIcon = await settingsToggle.locator('path').getAttribute('d');
    await settingsToggle.click();
    await expect(settingsToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(settingsToggle).toHaveAccessibleName('关闭设置');
    await expect(panel.locator('#connection-view')).toBeVisible();
    await expect(panel.locator('#pairing-status')).toHaveText('已添加');
    await expect(panel.locator('#token')).toBeHidden();
    await panel.screenshot({
      path: test.info().outputPath('pointdom-pairing-added.png'),
      animations: 'disabled',
    });
    await panel.locator('#change-pairing').click();
    await panel.locator('#token').focus();
    await panel.screenshot({
      path: test.info().outputPath('pointdom-input-focus-dark.png'),
      animations: 'disabled',
    });
    expect(await settingsToggle.locator('path').getAttribute('d')).not.toBe(closedIcon);
    await panel.screenshot({
      path: test.info().outputPath('pointdom-settings-open.png'),
      animations: 'disabled',
    });
    // A rejected replacement cannot overwrite the previously saved valid pairing.
    await panel.locator('#token').fill('invalid-replacement');
    await panel.locator('#connect').click();
    await expect(panel.locator('#settings-notice')).toBeVisible();
    expect(
      await panel.evaluate(
        async (token) => (await chrome.storage.local.get('bridgeToken')).bridgeToken === token,
        store.config.token,
      ),
    ).toBe(true);
    await expect(panel.locator('#token')).toHaveValue('invalid-replacement');
    // Let the saved credential reconnect before cancelling the failed replacement.
    // A background reconnect must not dismiss settings or discard the pairing draft.
    await expect(panel.locator('#connection')).toHaveText('已连接');
    await expect(panel.locator('#connection-view')).toBeVisible();
    await expect(panel.locator('#token')).toHaveValue('invalid-replacement');
    await expect(panel.locator('#settings-notice')).toBeVisible();
    await panel.locator('#cancel-pairing').click();
    await expect(panel.locator('#token')).toHaveCount(0);
    await expect(panel.locator('#pairing-status')).toHaveText('已添加');
    // Restoring the saved credential reconnects through the panel poll. The transient
    // reconnect button can disappear between visibility checking and clicking.
    await expect(panel.locator('#connection')).toHaveText('已连接');
    if ((await settingsToggle.getAttribute('aria-expanded')) === 'true')
      await settingsToggle.click();
    await expect(settingsToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(settingsToggle).toHaveAccessibleName('打开设置');
    await expect(panel.locator('#connection-view')).toBeHidden();
    await expect(settingsToggle.locator('path')).toHaveAttribute('d', closedIcon!);
    // Header controls replace the removed palette, including persisted-color migration.
    await expect(panel.locator('#appearance')).toHaveCount(0);
    await expect(panel.locator('html')).toHaveAttribute('data-accent', 'lime');
    const chooseMode = async (name: string) => {
      await panel.locator('#theme-mode').getByRole('radio', { name, exact: true }).click();
    };
    const chooseLanguage = async (name: string) => {
      await panel.locator('#language-toggle').click();
      await panel.getByRole('menuitemradio', { name, exact: true }).click();
      await expect(panel.getByRole('menu')).toBeHidden();
    };
    const expectLanguageCheckOnRight = async () => {
      const selected = panel.getByRole('menuitemradio', { checked: true });
      const label = await selected.locator('[data-slot="label"]').boundingBox();
      const check = await selected.locator('.language-check').boundingBox();
      expect(label).not.toBeNull();
      expect(check).not.toBeNull();
      expect(check!.x).toBeGreaterThanOrEqual(label!.x + label!.width + 12);
    };
    await panel.locator('#connection-settings').click();
    for (const [label, mode] of [
      ['浅色', 'light'],
      ['深色', 'dark'],
    ] as const) {
      await chooseMode(label);
      await expect(panel.locator('html')).toHaveAttribute('data-mode', mode);
      await expect(
        panel.locator('#theme-mode').getByRole('radio', { name: label, exact: true }),
      ).toHaveAttribute('aria-checked', 'true');
      await expect(panel.locator('#enable-page')).toHaveText('已启用');
      await expect(panel.locator('#enable-page')).toBeDisabled();
      await expect(panel.locator('.brand-point')).toHaveCSS('fill', 'rgb(168, 255, 0)');
      await panel.locator('#language-toggle').click();
      await expectLanguageCheckOnRight();
      await panel.screenshot({
        path: test.info().outputPath(`pointdom-language-chinese-${mode}.png`),
        animations: 'disabled',
      });
      await panel.getByRole('menu').press('Escape');
      await panel.locator('.app-header').screenshot({
        path: test.info().outputPath(`pointdom-header-${mode}.png`),
        animations: 'disabled',
      });
      await panel.locator('#language-toggle').hover();
      await panel.locator('.app-header').screenshot({
        path: test.info().outputPath(`pointdom-language-hover-${mode}.png`),
        animations: 'disabled',
      });
      await panel.locator('#change-pairing').hover();
      await panel.screenshot({
        path: test.info().outputPath(`pointdom-monochrome-${mode}.png`),
        animations: 'disabled',
      });
      await panel.locator('.app-header').screenshot({
        path: test.info().outputPath(`pointdom-settings-idle-${mode}.png`),
        animations: 'disabled',
      });
      await panel.locator('#change-pairing').click();
      await panel.locator('#token').focus();
      await panel.screenshot({
        path: test.info().outputPath(`pointdom-input-focus-${mode}.png`),
        animations: 'disabled',
      });
      await panel.locator('#cancel-pairing').click();
    }
    await panel.locator('#close-connection').click();
    await openExecution();
    await panel.screenshot({
      path: test.info().outputPath('pointdom-mcp-settings.png'),
      animations: 'disabled',
    });
    await expect(
      panel.locator(
        '#executor, #model, #speed, #effort, #approval, #auto-commit-field, #project-confirmation',
      ),
    ).toHaveCount(0);
    await expect(panel.getByRole('checkbox', { name: /Codex/ })).toHaveCount(0);
    await expect(panel.locator('#execution-help')).toContainText('客户端管理');
    expect(codexCalls).toBe(0);
    await closeExecution();
    await panel.locator('#connection-settings').click();
    const commands = await panel.evaluate(() => chrome.commands.getAll());
    for (const [id, name] of [
      ['shortcut-pick', 'pick-element'],
      ['shortcut-panel', '_execute_action'],
    ]) {
      await expect(panel.locator(`#${id}`)).toHaveText(
        commands.find((command) => command.name === name)?.shortcut || '未设置',
      );
    }
    await panel.screenshot({ path: test.info().outputPath('extension-shortcuts-test.png') });
    const shortcutsTabPromise = context.waitForEvent('page');
    await panel.locator('#edit-shortcuts').click();
    const shortcutsTab = await shortcutsTabPromise;
    await expect(shortcutsTab).toHaveURL('chrome://extensions/shortcuts');
    await shortcutsTab.close();
    await page.bringToFront();
    await expect(panel.locator('#close-connection')).toBeVisible();
    await panel.locator('#close-connection').click();
    await page.bringToFront();
    const togglePicker = () =>
      panel.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.scripting.executeScript({
          target: { tabId: tab!.id! },
          files: ['content.js'],
        });
      });
    const pickerButton = panel.locator('#pick');
    await expect(pickerButton).toHaveAttribute('aria-pressed', 'false');
    const pickerIdleBounds = await pickerButton.boundingBox();
    await pickerButton.click();
    await expect(pickerButton).toHaveAttribute('aria-pressed', 'true');
    await expect(pickerButton).toHaveAccessibleName('结束选取');
    await expect(pickerButton).not.toHaveAttribute('data-pending', 'true');
    const pickerAnimation = () =>
      pickerButton
        .locator('.picker-indicator')
        .evaluate((element) => getComputedStyle(element).animationName);
    await expect.poll(pickerAnimation).toBe('picker-breathe');
    expect(await pickerButton.evaluate((element) => getComputedStyle(element).animationName)).toBe(
      'none',
    );
    await panel
      .locator('.compose-tools')
      .screenshot({ path: test.info().outputPath('pointdom-picker-active.png') });
    expect((await pickerButton.boundingBox())!.width).toBe(pickerIdleBounds!.width);
    await panel.reload();
    await page.bringToFront();
    await expect(pickerButton).toHaveAttribute('aria-pressed', 'true');
    await panel.emulateMedia({ reducedMotion: 'reduce' });
    expect(
      await pickerButton
        .locator('.picker-indicator')
        .evaluate((element) => getComputedStyle(element).animationName),
    ).toBe('none');
    await panel.emulateMedia({ reducedMotion: 'no-preference' });
    await pickerButton.click();
    await expect(pickerButton).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(pickerAnimation).toBe('none');
    await togglePicker();
    await expect(pickerButton).toHaveAttribute('aria-pressed', 'true');
    const pickerDemoStyle = await page.addStyleTag({
      content: `
      body { background:#111014;color:#f1f2f3;min-height:100vh;font-family:system-ui; }
      body::before { content:'Point at what you want to change.';position:fixed;left:0;right:0;top:35%;text-align:center;font-size:34px;font-weight:650; }
      button { position:fixed;top:52%;border:0;border-radius:12px;padding:0 28px;height:48px!important;background:#313137;color:inherit;font:16px system-ui; }
      #send { left:35%; } #secondary { left:55%; }
    `,
    });
    const pickerTarget = await page.locator('#send').boundingBox();
    await page.mouse.move(
      pickerTarget!.x + pickerTarget!.width / 2,
      pickerTarget!.y + pickerTarget!.height / 2,
    );
    await expect(page.locator('[data-pointdom-picker]')).toHaveCount(1);
    const readPicker = () =>
      panel.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab!.id! },
          func: () => {
            const host = document.querySelector<HTMLElement>('[data-pointdom-picker]');
            const root = host && chrome.dom.openOrClosedShadowRoot(host);
            const box = root?.querySelector('.box');
            return {
              decorations: root?.querySelectorAll('.line, .corner, .dimensions').length,
              boxHidden: box?.hasAttribute('hidden'),
              transition: box ? getComputedStyle(box).transitionDuration : '',
              crosshairHidden: root?.querySelector('.crosshair')?.hasAttribute('hidden'),
              dimensions: root?.querySelector('.dimensions')?.textContent,
              lines: root?.querySelectorAll('.line').length,
              cornerX: new DOMMatrix(getComputedStyle(root!.querySelector('.corner')!).transform)
                .m41,
            };
          },
        });
        return result!.result;
      });
    await expect.poll(async () => (await readPicker())?.boxHidden).toBe(false);
    expect((await readPicker())?.decorations).toBe(5);
    expect((await readPicker())?.lines).toBe(0);
    expect((await readPicker())?.transition).toBe('0s');
    expect((await readPicker())?.dimensions).toBe(
      `${Math.round(pickerTarget!.width)} × ${Math.round(pickerTarget!.height)}`,
    );
    await expect
      .poll(async () => Math.abs((await readPicker())!.cornerX - (pickerTarget!.x - 5)))
      .toBeLessThan(0.2);
    await page.screenshot({ path: test.info().outputPath('pointdom-element-highlight.png') });
    const secondTarget = await page.locator('#secondary').boundingBox();
    await page.mouse.move(
      secondTarget!.x + secondTarget!.width / 2,
      secondTarget!.y + secondTarget!.height / 2,
    );
    await expect
      .poll(async () => Math.abs((await readPicker())!.cornerX - (secondTarget!.x - 5)))
      .toBeLessThan(0.2);
    await page.evaluate(() => window.dispatchEvent(new Event('scroll')));
    await expect.poll(async () => (await readPicker())?.crosshairHidden).toBe(true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.mouse.move(
      pickerTarget!.x + pickerTarget!.width / 2,
      pickerTarget!.y + pickerTarget!.height / 2,
    );
    await expect.poll(async () => (await readPicker())?.crosshairHidden).toBe(false);
    expect((await readPicker())?.cornerX).toBeCloseTo(pickerTarget!.x - 5, 1);
    const lightPickerStyle = await page.addStyleTag({
      content: 'body { background:#fff;color:#191c20; } button { background:#f1f3f5; }',
    });
    await page.screenshot({ path: test.info().outputPath('pointdom-element-highlight-light.png') });
    await lightPickerStyle.evaluate((element) => element.parentNode?.removeChild(element));
    await pickerDemoStyle.evaluate((element) => element.parentNode?.removeChild(element));
    expect((await readPicker())?.transition).toBe('0s');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.keyboard.press('Escape');
    await expect(pickerButton).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-pointdom-picker]')).toHaveCount(0);
    await expect(pickerButton).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(pickerAnimation).toBe('none');
    await togglePicker();
    await togglePicker();
    await page.locator('#send').click();
    await expect(page.locator('#send')).toHaveText('误触');
    await expect(panel.locator('#selected strong')).toHaveCount(0);
    await page.locator('#send').evaluate((button) => {
      button.textContent = '发送';
    });
    await togglePicker();
    await page.keyboard.press('Escape');
    await page.locator('#send').click();
    await expect(page.locator('#send')).toHaveText('误触');
    await page.locator('#send').evaluate((button) => {
      button.textContent = '发送';
    });
    await togglePicker();
    await page.locator('#send').click();
    await page.locator('#secondary').click();
    await page.locator('#secondary').click();
    await expect(panel.locator('#selected strong')).toHaveText(['发送', '取消']);
    await panel.getByRole('button', { name: '移除 取消', exact: true }).click();
    await expect(panel.locator('#selected strong')).toHaveCount(1);
    await page.locator('#secondary').click();
    await expect(panel.locator('#selected strong')).toHaveCount(2);
    await panel.locator('#instruction').fill('清空元素时保留整体要求');
    await panel.getByLabel('发送的修改描述').fill('将被清除的元素描述');
    await panel.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const data = await chrome.storage.local.get(`selection:${tab!.id}`);
      await chrome.storage.local.set({
        'selection:9999': data[`selection:${tab!.id}`],
        'draft:9999': '其他标签页草稿',
      });
    });
    await expect(panel.locator('#clear-selected')).toBeVisible();
    await panel.locator('#clear-selected').click();
    await expect(panel.locator('#selected strong')).toHaveCount(0);
    await expect(panel.locator('#clear-selected')).toHaveCount(0);
    await expect(panel.locator('#instruction')).toHaveValue('清空元素时保留整体要求');
    await expect(page.locator('[data-pointdom-picker]')).toHaveCount(0);
    const clearedState = await panel.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const data = await chrome.storage.local.get([
        `selection:${tab!.id}`,
        `draft:${tab!.id}`,
        'selection:9999',
        'draft:9999',
      ]);
      return {
        current: data[`selection:${tab!.id}`],
        draft: data[`draft:${tab!.id}`],
        otherCount: Array.isArray(data['selection:9999']) ? data['selection:9999'].length : 0,
        otherDraft: data['draft:9999'],
      };
    });
    expect(clearedState.current).toBeUndefined();
    expect(clearedState.draft).toBe('清空元素时保留整体要求');
    expect(clearedState.otherCount).toBe(2);
    expect(clearedState.otherDraft).toBe('其他标签页草稿');
    await panel.reload();
    await page.bringToFront();
    await expect(panel.locator('#instruction')).toHaveValue('清空元素时保留整体要求');
    await expect(panel.locator('#selected strong')).toHaveCount(0);
    await togglePicker();
    await page.locator('#send').click();
    await page.locator('#secondary').click();
    await expect(panel.locator('#selected strong')).toHaveCount(2);
    await panel.getByLabel('发送的修改描述').fill('发送按钮高度改为40px');
    await panel.getByLabel('取消的修改描述').fill('取消按钮圆角改为12px');
    expect((await panel.getByLabel('发送的修改描述').boundingBox())!.height).toBe(36);
    expect((await panel.locator('#instruction').boundingBox())!.height).toBe(40);
    const inspect = panel.getByRole('button', { name: '查看 发送 的元素与样式', exact: true });
    const details = panel.getByRole('dialog', { name: '发送 · 元素与样式', exact: true });
    const selectionBeforeDetails = await panel.locator('.selected-entry').first().boundingBox();
    const instructionBeforeDetails = await panel.locator('#instruction').boundingBox();
    await inspect.click();
    await expect(panel.locator('.element-details-popover')).toHaveCSS('opacity', '1');
    await expect(details.locator('.element-selector')).toContainText('#send');
    await expect(details.locator('.element-details-body')).toContainText('height');
    expect(await panel.locator('.selected-entry').first().boundingBox()).toEqual(
      selectionBeforeDetails,
    );
    expect(await panel.locator('#instruction').boundingBox()).toEqual(instructionBeforeDetails);
    await details.press('Escape');
    await expect(details).toBeHidden();
    await expect(inspect).toBeFocused();
    await inspect.click();
    const outsideDetails = await panel.locator('.brand').boundingBox();
    await panel.mouse.click(outsideDetails!.x + 8, outsideDetails!.y + 8);
    await expect(details).toBeHidden();
    await expect(panel.getByLabel('发送的修改描述')).toHaveValue('发送按钮高度改为40px');
    // Real HeroUI overlays preserve both the global and per-element drafts.
    await panel.locator('#instruction').fill('整体草稿');
    await panel.locator('#instruction').click();
    await expect(panel.locator('#instruction')).toHaveCSS('border-width', '0px');
    await expect(panel.locator('#instruction')).toHaveCSS('box-shadow', 'none');
    await expect(panel.locator('#instruction')).toHaveCSS('border-radius', '9px');
    await expect(panel.getByLabel('发送的修改描述')).toHaveCSS('resize', 'none');
    await chooseMode('浅色');
    await chooseLanguage('English');
    await expect(panel.locator('html')).toHaveAttribute('lang', 'en');
    await expect(panel.locator('html')).toHaveAttribute('data-mode', 'light');
    await expect(panel.locator('html')).toHaveAttribute('data-accent', 'lime');
    await expect(page.locator('html > div')).toHaveCSS('--pdo-accent', '#a8ff00');
    await expect(panel.locator('html')).toHaveAttribute('data-shape', 'rounded');
    await expect(panel.getByRole('heading', { name: 'New annotation', exact: true })).toBeVisible();
    await expect(panel.locator('#instruction')).toHaveValue('整体草稿');
    await expect(panel.locator('#pairing-status')).toHaveText('Added');
    await expect(panel.locator('#token')).toHaveCount(0);
    await expect(panel.getByLabel('Changes for 发送')).toHaveValue('发送按钮高度改为40px');
    await panel.screenshot({ path: test.info().outputPath('heroui-light-appearance.png') });
    const inspectEnglish = panel.getByRole('button', {
      name: 'Inspect element and styles for 发送',
      exact: true,
    });
    await inspectEnglish.click();
    await expect(panel.locator('.element-details-popover')).toHaveCSS('opacity', '1');
    await panel.screenshot({ path: test.info().outputPath('pointdom-element-details-light.png') });
    await panel
      .getByRole('dialog', { name: '发送 · Element and styles', exact: true })
      .press('Escape');
    await panel.setViewportSize({ width: 280, height: 850 });
    await inspectEnglish.click();
    const narrowDetails = panel.getByRole('dialog', {
      name: '发送 · Element and styles',
      exact: true,
    });
    const detailBounds = await narrowDetails.boundingBox();
    expect(detailBounds!.x).toBeGreaterThanOrEqual(0);
    expect(detailBounds!.x + detailBounds!.width).toBeLessThanOrEqual(280);
    expect(
      await narrowDetails.evaluate((element) => element.scrollWidth > element.clientWidth + 1),
    ).toBe(false);
    await narrowDetails.press('Escape');
    await panel.setViewportSize({ width: 280, height: 440 });
    await inspectEnglish.click();
    await expect(panel.locator('.element-details-popover')).toHaveCSS('opacity', '1');
    const shortDetails = await narrowDetails.boundingBox();
    expect(shortDetails!.y).toBeGreaterThanOrEqual(0);
    expect(shortDetails!.y + shortDetails!.height).toBeLessThanOrEqual(440);
    await narrowDetails.locator('.element-style-list > div').last().scrollIntoViewIfNeeded();
    await expect(narrowDetails.locator('.element-style-list > div').last()).toBeInViewport();
    await narrowDetails.press('Escape');
    await panel.setViewportSize({ width: 280, height: 850 });
    await panel.locator('.app-header').screenshot({
      path: test.info().outputPath('pointdom-header-narrow.png'),
      animations: 'disabled',
    });
    expect(
      await panel.locator('.app-header').evaluate((header) =>
        Array.from(header.querySelectorAll('button, .brand-mark, #connection'))
          .filter((node) => {
            const box = node.getBoundingClientRect();
            return box.left < 0 || box.right > innerWidth;
          })
          .map((node) => node.id),
      ),
    ).toEqual([]);
    await panel.setViewportSize({ width: 390, height: 850 });

    await panel.locator('#language-toggle').click();
    await expectLanguageCheckOnRight();
    await panel.screenshot({
      path: test.info().outputPath('pointdom-header-language.png'),
      animations: 'disabled',
    });
    await panel.getByRole('menu').press('Escape');
    await expect(panel.getByRole('menu')).toBeHidden();
    await panel.reload();
    await page.bringToFront();
    await expect(panel.locator('#connection')).toHaveText('Connected');
    await expect(panel.locator('html')).toHaveAttribute('data-mode', 'light');
    await expect(panel.locator('html')).toHaveAttribute('data-shape', 'rounded');
    await expect(panel.locator('#instruction')).toHaveValue('整体草稿');
    await chooseMode('System');
    await panel.emulateMedia({ colorScheme: 'dark' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(panel.locator('html')).toHaveAttribute('data-mode', 'dark');
    await expect(page.locator('html > div')).toHaveCSS('--pdo-accent', '#a8ff00');
    await panel.emulateMedia({ colorScheme: 'light' });
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(panel.locator('html')).toHaveAttribute('data-mode', 'light');
    await chooseLanguage('简体中文');
    const clearButton = panel.locator('#clear-selected');
    const clearBounds = await clearButton.boundingBox();
    await clearButton.hover();
    expect(await clearButton.boundingBox()).toEqual(clearBounds);
    await panel.locator('.composer-title').screenshot({
      path: test.info().outputPath('pointdom-clear-hover-light.png'),
      animations: 'disabled',
    });
    await panel.locator('#instruction').click();
    await expect(panel.locator('#instruction')).toHaveCSS('outline-style', 'none');
    await panel.locator('#instruction').press('Shift+Tab');
    await expect(panel.getByLabel('取消的修改描述')).toBeFocused();
    await expect(panel.getByLabel('取消的修改描述')).toHaveCSS('outline-width', '1px');
    await panel.locator('#instruction').click();
    await panel.locator('.compose-box').screenshot({
      path: test.info().outputPath('pointdom-compact-selection-light.png'),
      animations: 'disabled',
    });
    const inspectChinese = panel.getByRole('button', {
      name: '查看 发送 的元素与样式',
      exact: true,
    });
    await inspectChinese.click();
    await expect(panel.locator('.element-details-popover')).toHaveCSS('opacity', '1');
    await panel.screenshot({
      path: test.info().outputPath('pointdom-element-details-light.png'),
      animations: 'disabled',
    });
    await panel.getByRole('dialog', { name: '发送 · 元素与样式', exact: true }).press('Escape');
    await chooseMode('深色');
    await panel.locator('#pick').hover();
    await panel.locator('.compose-tools').screenshot({
      path: test.info().outputPath('pointdom-buttons-hover-dark.png'),
      animations: 'disabled',
    });
    await panel.locator('.compose-box').screenshot({
      path: test.info().outputPath('pointdom-compact-selection-dark.png'),
      animations: 'disabled',
    });
    await panel.screenshot({ path: test.info().outputPath('heroui-dark-appearance.png') });
    await panel.locator('#instruction').fill('');
    await expect(panel.locator('#submit')).toBeEnabled();
    await panel.emulateMedia({ reducedMotion: 'no-preference' });
    const send = panel.locator('#submit');
    const sendBounds = await send.boundingBox();
    await send.hover({ position: { x: sendBounds!.width - 2, y: sendBounds!.height / 2 } });
    expect(await send.evaluate((button) => getComputedStyle(button, '::before').content)).toBe(
      'none',
    );
    expect(await send.evaluate((button) => getComputedStyle(button).boxShadow)).toBe('none');
    await panel.locator('.compose-tools').screenshot({
      path: test.info().outputPath('pointdom-submit-plain-dark.png'),
    });
    await chooseMode('浅色');
    await send.hover();
    expect(await send.evaluate((button) => getComputedStyle(button, '::after').content)).toBe(
      'none',
    );
    await panel.locator('.compose-tools').screenshot({
      path: test.info().outputPath('pointdom-submit-plain-light.png'),
    });
    await chooseMode('深色');
    await panel.screenshot({ path: test.info().outputPath('element-descriptions-test.png') });
    await panel.locator('#instruction').dispatchEvent('keydown', { key: 'Enter', shiftKey: true });
    await panel
      .locator('#instruction')
      .dispatchEvent('keydown', { key: 'Enter', isComposing: true });
    expect(store.jobs).toHaveLength(0);
    await panel.locator('#instruction').press('Enter');
    await expect.poll(() => store.jobs[0]?.status).toBe('queued');
    expect(store.jobs[0]?.startedAt).toBeUndefined();
    expect(store.jobs[0]?.result).toBe('');
    {
      const tools = (await mcpClient.listTools()).tools.map((tool) => tool.name);
      expect(tools).toContain('pointdom_progress_task');
      const taskId = store.jobs[0]!.id;
      expect(
        (await mcpClient.callTool({ name: 'pointdom_get_task', arguments: { taskId } })).isError,
      ).not.toBe(true);
      expect(
        (
          await mcpClient.callTool({
            name: 'pointdom_claim_task',
            arguments: { taskId, agent: 'Fixture Agent' },
          })
        ).isError,
      ).not.toBe(true);
      await expect(panel.locator('#jobs')).toContainText('Agent 处理中');
      await expect(panel.locator('.delivery-status')).toHaveCount(0);
      for (const [stepId, message] of [
        ['read', '已定位 button.css'],
        ['edit', '已更新 button.css'],
        ['check', '已检查按钮高度'],
      ] as const) {
        const arguments_ = { taskId, stepId, message };
        expect(
          (await mcpClient.callTool({ name: 'pointdom_progress_task', arguments: arguments_ }))
            .isError,
        ).not.toBe(true);
        expect(
          (await mcpClient.callTool({ name: 'pointdom_progress_task', arguments: arguments_ }))
            .isError,
        ).not.toBe(true);
      }
      await panel.getByRole('button', { name: /^执行记录/ }).click();
      await expect(panel.locator('.job-details pre')).toContainText('已检查按钮高度');
      expect(store.jobs[0]!.events.filter((event) => event.progressId)).toHaveLength(3);
      // The external fixture client performs the edit; PointDOM only receives the report.
      writeFileSync(join(projectDirectory, 'button.css'), 'button { height: 40px; }');
      expect(
        (
          await mcpClient.callTool({
            name: 'pointdom_report_task',
            arguments: {
              taskId,
              outcome: 'completed',
              summary: '已将发送按钮高度改为 40px',
              files: ['button.css'],
              verification: '已检查临时项目中的 CSS 文件',
            },
          })
        ).isError,
      ).not.toBe(true);
    }
    await expect(panel.locator('#jobs')).toContainText('Agent 已回报');
    expect(store.jobs[0]?.permissions).toBeUndefined();
    expect(store.jobs[0]?.execution).toBeUndefined();
    expect(store.jobs[0]?.selections?.map((s) => s.description)).toEqual([
      '发送按钮高度改为40px',
      '取消按钮圆角改为12px',
    ]);
    await expect(panel.locator('#selected strong')).toHaveCount(0);
    await page.locator('#send').click();
    await expect(page.locator('#send')).toHaveText('误触');
    await panel.getByRole('button', { name: /^修改结果/ }).click();
    await expect(panel.locator('#jobs')).toContainText('已将发送按钮高度改为 40px');
    await expect(panel.getByRole('button', { name: 'Commit', exact: true })).toHaveCount(0);
    expect(git('log', '-1', '--format=%s').toString().trim()).toBe('initial');
    const completedCard = panel.locator('.job[data-status="completed"]').first();
    const notesRow = completedCard.getByRole('button', { name: '元素描述 2', exact: true });
    const activityRow = completedCard.getByRole('button', { name: /^执行记录/ });
    const resultRow = completedCard.getByRole('button', { name: /^修改结果/ });
    await expect(resultRow.locator('.fold-detail')).toContainText('总耗时');
    expect(store.jobs[0]?.startedAt).toBeTruthy();
    expect(store.jobs[0]?.finishedAt).toBeTruthy();
    for (const row of [notesRow, activityRow, resultRow]) {
      const rowBox = await row.boundingBox();
      const labelBox = await row.locator('.fold-label').boundingBox();
      expect(rowBox).not.toBeNull();
      expect(labelBox).not.toBeNull();
      expect(labelBox!.x - rowBox!.x).toBeLessThan(28);
      expect(rowBox!.height).toBeLessThanOrEqual(34);
      await expect(row.locator('svg')).toHaveCSS('margin-inline-start', '0px');
      await expect(row.locator('..').locator('..')).toHaveCSS('border-width', '0px');
    }
    await notesRow.click();
    await expect(notesRow).toHaveAttribute('aria-expanded', 'true');
    await expect(completedCard.locator('.job-element-note').first()).toContainText(
      '发送按钮高度改为40px',
    );
    await notesRow.press('Space');
    await expect(notesRow).toHaveAttribute('aria-expanded', 'false');
    await expect(notesRow).toHaveCSS('box-shadow', 'none');
    await expect(notesRow).toHaveCSS('outline-width', '1px');
    await completedCard.screenshot({
      path: test.info().outputPath('pointdom-task-card-dark-expanded.png'),
      animations: 'disabled',
    });
    await resultRow.click();
    await chooseMode('浅色');
    await completedCard.screenshot({
      path: test.info().outputPath('pointdom-task-card-light-compact.png'),
      animations: 'disabled',
    });
    await resultRow.hover();
    await expect(resultRow).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await completedCard.getByRole('button', { name: '继续修改', exact: true }).hover();
    await panel.screenshot({
      path: test.info().outputPath('pointdom-light-workspace-hover.png'),
      animations: 'disabled',
    });
    await expect(completedCard).toHaveCSS('box-shadow', 'none');
    await panel.setViewportSize({ width: 280, height: 850 });
    expect(await completedCard.evaluate((card) => card.scrollWidth <= card.clientWidth)).toBe(true);
    await panel.setViewportSize({ width: 390, height: 850 });
    await chooseMode('深色');
    await panel.getByRole('button', { name: '继续修改', exact: true }).click();
    await expect(panel.getByLabel('发送的修改描述')).toHaveValue('发送按钮高度改为40px');
    await page.bringToFront();
    await panel.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.storage.local.remove(`selection:${tab!.id}`);
    });
    await expect(panel.locator('#selected strong')).toHaveCount(0);
    await panel.locator('#instruction').fill('调整页面间距');
    await expect(panel.locator('#submit')).toHaveCSS('background-color', 'rgb(241, 243, 245)');
    await expect(panel.locator('#submit')).toHaveCSS('color', 'rgb(21, 24, 27)');
    await panel.locator('#submit').click();
    await expect.poll(() => store.jobs.length).toBe(2);
    expect(store.jobs[1]?.selection.label).toBe('页面修改');
    await expect(panel.locator('#submit')).toBeDisabled();
    await openExecution();
    await expect(panel.locator('#auto-commit-field')).toHaveCount(0);
    await closeExecution();
    await panel.reload();
    await page.bringToFront();
    await expect(panel.locator('#connection')).toHaveText('已连接');
    await openExecution();
    await expect(panel.getByRole('checkbox', { name: '自动 Commit' })).toHaveCount(0);
    await panel.screenshot({ path: test.info().outputPath('extension-settings-test.png') });
    await closeExecution();
    await panel.setViewportSize({ width: 390, height: 500 });
    const before = await panel.locator('#instruction').boundingBox();
    const scroll = await panel.locator('.record-scroll').evaluate((area) => {
      area.scrollTop = area.scrollHeight;
      return {
        moved: area.scrollTop,
        overflow: document.documentElement.scrollHeight > innerHeight,
      };
    });
    expect(scroll.moved).toBeGreaterThan(0);
    expect(scroll.overflow).toBe(false);
    expect(await panel.locator('#instruction').boundingBox()).toEqual(before);
    // An external agent has not claimed this second annotation; cancellation,
    // not a local runner, removes it from the active inbox.
    await panel
      .locator('.job[data-status="queued"]')
      .getByRole('button', { name: '取消批注', exact: true })
      .click();
    await panel.locator('#tab-active').click();
    await expect(panel.locator('#jobs')).toContainText('暂无进行中的修改');
    await panel.locator('#tab-all').click();
    store.jobs[0]!.status = 'running';
    store.jobs[0]!.instruction = '调整商品卡片间距，让标题与操作按钮保持对齐。';
    await panel.locator('#refresh').click();
    await expect(panel.locator('#tab-active')).toHaveClass(/has-active-jobs/);
    const runningCard = panel.locator('.job[data-status="running"]').first();
    await panel.emulateMedia({ reducedMotion: 'no-preference' });
    await panel.setViewportSize({ width: 390, height: 850 });
    await panel.locator('#instruction').fill('将标题与操作按钮对齐，缩小卡片间距。');
    await panel.locator('#tab-active').click();
    for (const [label, mode, background, width] of [
      ['浅色', 'light', 'rgb(255, 255, 255)', '2px'],
      ['深色', 'dark', 'rgb(17, 19, 21)', '1.5px'],
    ] as const) {
      await chooseMode(label);
      await expect(panel.locator('html')).toHaveCSS('background-color', background);
      expect(
        await runningCard.evaluate(
          (element) => getComputedStyle(element, '::before').animationName,
        ),
      ).toBe('task-border-flow');
      expect(
        await runningCard.evaluate(
          (element) => getComputedStyle(element, '::before').backgroundImage,
        ),
      ).toContain('conic-gradient');
      expect(
        await runningCard.evaluate((element) => getComputedStyle(element, '::before').paddingTop),
      ).toBe(width);
      const initialAngle = await runningCard.evaluate((element) =>
        getComputedStyle(element, '::before').getPropertyValue('--task-border-angle'),
      );
      await expect
        .poll(() =>
          runningCard.evaluate((element) =>
            getComputedStyle(element, '::before').getPropertyValue('--task-border-angle'),
          ),
        )
        .not.toBe(initialAngle);
      await expect(runningCard).toHaveCSS('box-shadow', 'none');
      await runningCard.scrollIntoViewIfNeeded();
      await panel.screenshot({
        path: test.info().outputPath(`pointdom-running-theme-${mode}.png`),
        animations: 'disabled',
      });
    }
    await panel.locator('#instruction').fill('');
    await panel.locator('#tab-all').click();
    store.jobs[0]!.instruction = '很长的修改描述'.repeat(40) + 'LongUnbrokenSelector'.repeat(30);
    await panel.locator('#refresh').click();
    for (const width of [280, 320, 375, 390, 414, 768]) {
      await panel.setViewportSize({ width, height: 850 });
      expect(
        await panel.evaluate(() =>
          [...document.querySelectorAll('.panel-layout, .compose-box, .target, .job')].some(
            (e) => e.scrollWidth > e.clientWidth + 1,
          ),
        ),
      ).toBe(false);
    }
    await panel.setViewportSize({ width: 390, height: 850 });
    expect(
      await panel
        .locator('#tab-active')
        .evaluate((e) => getComputedStyle(e, '::before').animationName),
    ).toBe('none');
    await panel.emulateMedia({ reducedMotion: 'reduce' });
    expect(
      await runningCard.evaluate((element) => getComputedStyle(element, '::before').animationName),
    ).toBe('none');
    expect(
      await panel
        .locator('#tab-active')
        .evaluate((e) => getComputedStyle(e, '::before').animationName),
    ).toBe('none');
    for (const status of ['waiting', 'queued', 'failed', 'cancelled', 'completed'] as const) {
      store.jobs[0]!.status = status;
      await panel.locator('#refresh').click();
      const card = panel.locator(`.job[data-status="${status}"]`).first();
      await expect(card).toBeVisible();
      expect(await card.evaluate((element) => getComputedStyle(element, '::before').content)).toBe(
        'none',
      );
    }
    store.jobs[0]!.status = 'completed';
    await panel.locator('#refresh').click();
    await expect(panel.locator('#tab-active')).not.toHaveClass(/has-active-jobs/);
    await expect(panel.locator('.job[data-status="running"]')).toHaveCount(0);
    await panel.locator('#instruction').fill('取消这条 MCP 批注');
    await panel.locator('#submit').click();
    await expect.poll(() => store.jobs.at(-1)?.status).toBe('queued');
    const pendingCard = panel.locator('.job').filter({ hasText: '取消这条 MCP 批注' });
    await expect(pendingCard.getByRole('button', { name: /复制/ })).toHaveCount(0);
    await pendingCard.getByRole('button', { name: '取消批注', exact: true }).click();
    await expect.poll(() => store.jobs.at(-1)?.status).toBe('cancelled');
    await expect(panel.locator('#execution-summary')).toHaveText('isolated-agent-fixture');
    expect(runtimeErrors).toEqual([]);
  } finally {
    await mcpClient.close();
    console.log('Closing browser');
    await context.close();
    bridge.close();
    site.close();
    rmSync(directory, { recursive: true, force: true });
    rmSync(projectDirectory, { recursive: true, force: true });
  }
});
