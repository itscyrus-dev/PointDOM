import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { test, expect, chromium } from '@playwright/test';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import {
  mkdtempSync,
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

test('packaged extension selects a real DOM element, submits to bridge and displays result', async () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'pagepatch-extension-')));
  const extension = join(directory, 'extension');
  cpSync(resolve('dist/extension'), extension, { recursive: true });
  // Only the isolated test copy gets a fixture-host grant. Distribution uses activeTab.
  const manifest = JSON.parse(readFileSync(join(extension, 'manifest.json'), 'utf8'));
  expect(manifest.permissions).not.toContain('tabs');
  expect(manifest.host_permissions).toEqual(['http://127.0.0.1:4318/*']);
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
  store.config.defaultExecutor = 'codex';
  store.config.projects.push({
    id: randomUUID(),
    name: '测试项目',
    cwd: projectDirectory,
    origins: ['http://127.0.0.1:5175'],
  });
  store.saveConfig();
  const queue = new Queue(store, (_project, _job, _thread, hooks) => ({
    done: new Promise<void>((resolve) =>
      setTimeout(() => {
        writeFileSync(join(projectDirectory, 'button.css'), 'button { height: 40px; }');
        hooks.result('已将发送按钮高度改为 40px');
        resolve();
      }, 150),
    ),
    cancel() {},
    reply() {},
  }));
  const reservation = createServer();
  await new Promise<void>((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const address = reservation.address();
  if (!address || typeof address === 'string') throw new Error('fixture port unavailable');
  const bridgePort = address.port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const fixtureAddress = `127.0.0.1:${bridgePort}`;
  const rewritePort = (text: string) => text.replaceAll('127.0.0.1:4318', fixtureAddress);
  writeFileSync(join(extension, 'manifest.json'), rewritePort(JSON.stringify(manifest)));
  writeFileSync(
    join(extension, 'panel.js'),
    rewritePort(readFileSync(join(extension, 'panel.js'), 'utf8')),
  );
  const mcpEntry = join(directory, 'mcp.mjs');
  writeFileSync(mcpEntry, rewritePort(readFileSync(resolve('dist/bridge/mcp.js'), 'utf8')));
  symlinkSync(resolve('node_modules'), join(directory, 'node_modules'));
  const app = new Hono();
  // Avoid consuming real model usage during automated UI tests.
  app.get('/api/models', (c) =>
    c.json({
      models: [
        {
          model: 'test-model',
          name: '测试模型',
          isDefault: true,
          efforts: ['low', 'high'],
          defaultEffort: 'low',
          tiers: [{ id: 'fast', name: '快速' }],
        },
      ],
    }),
  );
  app.get('/api/status', (c) => c.json({ codex: true, authenticated: true }));
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
    args: [
      '--enable-unsafe-extension-debugging',
      '--disable-features=DisableLoadExtensionCommandLineSwitch',
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  context.setDefaultTimeout(7000);
  try {
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
    await panel.goto(`chrome-extension://${id}/panel.html`);
    console.log('Panel loaded');
    await panel.evaluate(
      (token) => chrome.storage.local.set({ bridgeToken: token }),
      store.config.token,
    );
    await panel.reload();
    console.log('Token seeded');
    await page.bringToFront();
    console.log('Awaiting connection');
    await expect(panel.locator('#connection')).toHaveText('已连接');
    console.log('Connected');
    await page.evaluate(() => {
      const old = document.createElement('div');
      old.id = 'pagepatch-toolbar';
      document.body.append(old);
    });
    const commands = await panel.evaluate(() => chrome.commands.getAll());
    expect(commands.map((command) => command.name)).toEqual(
      expect.arrayContaining(['pick-element', '_execute_action']),
    );
    await panel
      .locator('#connection-settings')
      .evaluate((button: HTMLButtonElement) => button.click());
    for (const [id, name] of [
      ['shortcut-pick', 'pick-element'],
      ['shortcut-panel', '_execute_action'],
    ]) {
      await expect(panel.locator(`#${id}`)).toHaveText(
        commands.find((command) => command.name === name)?.shortcut || '未设置',
      );
    }
    await panel.setViewportSize({ width: 390, height: 850 });
    await panel.screenshot({ path: test.info().outputPath('extension-shortcuts-test.png') });
    const shortcutsTabPromise = context.waitForEvent('page');
    await panel.locator('#edit-shortcuts').evaluate((button: HTMLButtonElement) => button.click());
    const shortcutsTab = await shortcutsTabPromise;
    await expect(shortcutsTab).toHaveURL('chrome://extensions/shortcuts');
    await shortcutsTab.close();
    await panel
      .locator('#close-connection')
      .evaluate((button: HTMLButtonElement) => button.click());
    await page.bringToFront();
    await panel.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.scripting.executeScript({ target: { tabId: tab!.id! }, files: ['toolbar.js'] });
    });
    await expect(page.locator('#pagepatch-toolbar')).toHaveCount(0);
    // Reinject exactly the same picker script used by the keyboard command.
    const togglePicker = () =>
      panel.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        await chrome.scripting.executeScript({
          target: { tabId: tab!.id! },
          files: ['content.js'],
        });
      });
    await togglePicker();
    await togglePicker();
    // Exiting must restore normal page clicks, without selecting anything.
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
    await page.getByRole('button', { name: '发送', exact: true }).click();
    console.log('Element picked');
    await expect(panel.locator('#selected strong')).toHaveText('发送');
    await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible();
    await expect(panel.locator('#selected strong')).toHaveText('发送');
    await page.locator('#secondary').click();
    await expect(panel.locator('#selected strong')).toHaveText(['发送', '取消']);
    await page.locator('#secondary').click();
    await expect(panel.locator('#selected strong')).toHaveCount(2);
    await panel
      .getByRole('button', { name: '移除 取消', exact: true })
      .evaluate((button: HTMLButtonElement) => button.click());
    await expect(panel.locator('#selected strong')).toHaveCount(1);
    await page.locator('#secondary').click();
    await expect(panel.locator('#selected strong')).toHaveCount(2);
    await panel
      .locator('#instruction')
      .evaluate((input) =>
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
      );
    await page.locator('#send').click();
    await expect(page.locator('#send')).toHaveText('误触');
    await page.locator('#send').evaluate((button) => {
      button.textContent = '发送';
    });
    await togglePicker();
    await expect(panel.locator('#project')).not.toHaveValue('');
    await expect(panel.locator('#model option[value="test-model"]')).toHaveCount(1);
    await panel.evaluate(() => {
      for (const [id, value] of [
        ['model', 'test-model'],
        ['speed', 'fast'],
        ['effort', 'high'],
        ['approval', 'never'],
      ]) {
        const select = document.getElementById(id!) as HTMLSelectElement;
        select.value = value!;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    for (const [label, value] of [
      ['发送的修改描述', '发送按钮高度改为40px'],
      ['取消的修改描述', '取消按钮圆角改为12px'],
    ]) {
      await panel.getByLabel(label!).evaluate((input: HTMLTextAreaElement, text) => {
        input.focus();
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, value!);
    }
    await expect(panel.getByLabel('发送的修改描述')).toHaveValue('发送按钮高度改为40px');
    await expect(panel.getByLabel('取消的修改描述')).toHaveValue('取消按钮圆角改为12px');
    await panel.screenshot({ path: test.info().outputPath('element-descriptions-test.png') });
    await panel.locator('#instruction').evaluate((input: HTMLTextAreaElement) => {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(panel.locator('#submit')).toBeEnabled();
    await panel.locator('#instruction').evaluate((input) => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }),
      );
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }),
      );
    });
    expect(store.jobs).toHaveLength(0);
    await panel.locator('#instruction').evaluate((input) => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    });
    await expect(panel.locator('#jobs')).toContainText('已完成', { timeout: 12000 });
    await expect(panel.locator('#jobs')).toContainText('已将发送按钮高度改为 40px');
    await expect(panel.locator('#selected strong')).toHaveCount(0);
    await page.locator('#send').click();
    await expect(page.locator('#send')).toHaveText('误触');
    await page.locator('#send').evaluate((button) => {
      button.textContent = '发送';
    });
    await panel.getByRole('button', { name: 'Commit', exact: true }).click();
    await expect(panel.locator('#jobs')).toContainText('已 Commit');
    expect(git('log', '-1', '--format=%s').toString()).toContain('fix: 按独立描述修改 2 个元素');
    const inline = panel;
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(inline.locator('#project-field')).toBeHidden();
    await inline.getByRole('button', { name: '继续修改', exact: true }).click();
    await inline.getByLabel('修改意见').fill('圆角改为12px');
    await expect(inline.locator('#submit')).toBeEnabled();
    expect(store.jobs.length).toBe(1);
    expect(store.jobs[0]?.execution).toEqual({
      model: 'test-model',
      serviceTier: 'fast',
      effort: 'high',
      approvalPolicy: 'never',
    });
    expect(store.jobs[0]?.selection.selector).toBe('#send');
    expect(store.jobs[0]?.selections?.map((item) => item.description)).toEqual([
      '发送按钮高度改为40px',
      '取消按钮圆角改为12px',
    ]);
    await expect(panel.getByLabel('发送的修改描述')).toHaveValue('发送按钮高度改为40px');
    expect(store.jobs[0]?.selections?.map((item) => item.selector)).toEqual([
      '#send',
      '#secondary',
    ]);
    // Text-only requests use the currently bound page without requiring an element.
    await page.bringToFront();
    await panel.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.storage.local.remove(`selection:${tab!.id}`);
    });
    await expect(panel.locator('#selected strong')).toHaveCount(0);
    await panel.locator('#instruction').evaluate((input: HTMLTextAreaElement) => {
      input.value = '调整页面间距';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(panel.locator('#submit')).toHaveCSS('background-color', 'rgb(168, 255, 0)');
    await panel.locator('#instruction').evaluate((input) => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      );
    });
    await expect.poll(() => store.jobs.length).toBe(2);
    expect(store.jobs[1]?.selection.label).toBe('页面修改');
    await expect(panel.locator('#submit')).toBeDisabled();
    await panel.locator('#auto-commit').evaluate((input: HTMLInputElement) => {
      input.checked = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await panel.reload();
    await expect(panel.locator('#auto-commit')).toBeChecked();
    await expect(panel.locator('#model')).toHaveValue('test-model');
    await expect(panel.locator('#effort')).toHaveValue('high');
    await expect(panel.locator('#speed')).toHaveValue('fast');
    await expect(panel.locator('#approval')).toHaveValue('never');
    await panel.locator('#execution-settings').evaluate((details: HTMLDetailsElement) => {
      details.open = true;
    });
    await panel.locator('#instruction').evaluate((input: HTMLTextAreaElement) => {
      input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    await expect(panel.locator('#execution-settings')).not.toHaveAttribute('open', '');
    await panel.locator('#execution-settings').evaluate((details: HTMLDetailsElement) => {
      details.open = true;
    });
    await panel.locator('#execution-settings').evaluate((details: HTMLDetailsElement) => {
      details.open = false;
    });
    await panel.setViewportSize({ width: 390, height: 500 });
    await expect(panel.locator('#jobs')).toContainText('已完成');
    const inputBefore = await panel.locator('#instruction').boundingBox();
    const scroll = await panel.locator('.record-scroll').evaluate((area) => {
      area.scrollTop = area.scrollHeight;
      return {
        moved: area.scrollTop,
        overflow: document.documentElement.scrollHeight > innerHeight,
      };
    });
    expect(scroll.moved).toBeGreaterThan(0);
    expect(scroll.overflow).toBe(false);
    expect(await panel.locator('#instruction').boundingBox()).toEqual(inputBefore);
    await panel.locator('#tab-active').click();
    await expect(panel.locator('#jobs')).toContainText('暂无进行中的修改');
    await panel.locator('#tab-all').click();
    await expect(panel.locator('#jobs')).toContainText('已完成');
    await panel.setViewportSize({ width: 390, height: 850 });
    await panel.screenshot({ path: test.info().outputPath('extension-test.png') });
    await panel.locator('#execution-settings summary').click();
    await expect(panel.locator('#model')).toBeVisible();
    await panel.screenshot({ path: test.info().outputPath('extension-settings-test.png') });
    await panel.locator('#execution-settings').evaluate((details: HTMLDetailsElement) => {
      details.open = false;
    });
    store.jobs[0]!.status = 'running';
    store.jobs[0]!.instruction = '很长的修改描述'.repeat(40) + 'LongUnbrokenSelector'.repeat(30);
    await panel.locator('#refresh').evaluate((button: HTMLButtonElement) => button.click());
    await expect(panel.locator('#tab-active')).toHaveClass(/has-active-jobs/);
    await expect(panel.locator('#tab-active')).toHaveCSS('position', 'relative');
    // Exercise selected element titles and selector detail alongside long task text.
    await panel.evaluate(() => {
      const target = document.getElementById('selected')!;
      target.className = 'target';
      const row = document.createElement('div');
      row.className = 'selected-row';
      const text = document.createElement('strong');
      text.textContent = 'ImageModelWithAVeryLongName'.repeat(20);
      row.append(text);
      target.replaceChildren(row);
      const detail = document.createElement('details');
      detail.open = true;
      const code = document.createElement('code');
      code.textContent = '#long-selector'.repeat(50);
      detail.append(code);
      target.append(detail);
    });
    for (const width of [280, 390]) {
      await panel.setViewportSize({ width, height: 850 });
      const overflow = await panel.evaluate(() =>
        [...document.querySelectorAll('.panel-layout, .compose-box, .target, .job')].some(
          (e) => e.scrollWidth > e.clientWidth + 1,
        ),
      );
      expect(overflow).toBe(false);
    }
    await panel.screenshot({ path: test.info().outputPath('extension-wrap-test.png') });
    const animation = await panel
      .locator('#tab-active')
      .evaluate((e) => getComputedStyle(e, '::before').animationName);
    expect(animation).toBe('activity-orbit');
    await panel.emulateMedia({ reducedMotion: 'reduce' });
    expect(
      await panel
        .locator('#tab-active')
        .evaluate((e) => getComputedStyle(e, '::before').animationName),
    ).toBe('none');
    store.jobs[0]!.status = 'completed';
    await panel.locator('#refresh').evaluate((button: HTMLButtonElement) => button.click());
    await expect(panel.locator('#tab-active')).not.toHaveClass(/has-active-jobs/);
    // Direct OpenCode dispatch: no MCP claim or open TUI required.
    await panel.locator('#execution-settings').evaluate((e: HTMLDetailsElement) => {
      e.open = true;
    });
    await panel.locator('#executor').selectOption('opencode');
    await expect(panel.locator('#model')).toBeHidden();
    await expect(panel.locator('#execution-help')).toContainText('发送后直接执行');
    await panel.locator('#execution-settings').evaluate((e: HTMLDetailsElement) => {
      e.open = false;
    });
    await panel.locator('#instruction').fill('直接通过 OpenCode CLI 修改高度');
    await panel.locator('#submit').click();
    await expect
      .poll(() => store.jobs.find((job) => job.executor === 'opencode')?.status)
      .toBe('completed');
    const direct = store.jobs.find((job) => job.executor === 'opencode')!;
    expect(direct.projectId).toBe(store.config.projects[0]!.id);
    expect(direct.execution).toBeUndefined();
    await panel.reload();
    await expect(panel.locator('#connection')).toHaveText('已连接');
    await expect(panel.locator('#executor')).toHaveValue('opencode');
    // New registrations appear without re-pairing or restarting the panel/service.
    store.config.projects.push({
      id: randomUUID(),
      name: '同地址另一个项目',
      cwd: directory,
      origins: ['http://127.0.0.1:5175'],
    });
    // The live project poll may already open settings before a refresh click.
    await expect(panel.locator('#project option')).toHaveCount(3);
    expect(await panel.locator('#project').inputValue()).toBe('');
    await expect(panel.locator('#submit')).toBeDisabled();
    await panel.locator('#project').selectOption(direct.projectId);
    await panel.locator('#close-connection').click();
    store.config.projects.pop();
    await panel.locator('#refresh').click();
    // Real stdio MCP client -> authenticated bridge -> extension task lifecycle.
    await panel.locator('#execution-settings').evaluate((e: HTMLDetailsElement) => {
      e.open = true;
    });
    await panel.locator('#executor').selectOption('mcp');
    await expect(panel.locator('#model')).toBeHidden();
    await expect(panel.locator('#execution-help')).toContainText('对应 App');
    await panel.locator('#execution-settings').evaluate((e: HTMLDetailsElement) => {
      e.open = false;
    });
    await panel.locator('#instruction').fill('通过其他 Agent 修改 DOM 元素');
    await panel.locator('#submit').click();
    await expect(panel.locator('#notice')).toContainText('已发布批注');
    const external = store.jobs.find((j) => j.executor === 'mcp')!;
    expect(external.status).toBe('queued');
    expect(external.execution).toBeUndefined();
    const client = new Client({ name: 'integration-test', version: '1.0.0' });
    try {
      await client.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: [mcpEntry, '--project', projectDirectory],
          env: {
            ...Object.fromEntries(
              Object.entries(process.env).filter(
                (entry): entry is [string, string] => typeof entry[1] === 'string',
              ),
            ),
            PAGEPATCH_HOME: store.directory,
          },
        }),
      );
      expect((await client.listTools()).tools).toHaveLength(4);
      const list = await client.callTool({ name: 'pagepatch_list_tasks', arguments: {} });
      expect(JSON.stringify(list)).toContain(external.id);
      const data = await client.callTool({
        name: 'pagepatch_get_task',
        arguments: { taskId: external.id },
      });
      expect(JSON.stringify(data)).toContain('untrustedPageContext');
      const claimed = await client.callTool({
        name: 'pagepatch_claim_task',
        arguments: { taskId: external.id, agent: '测试 Agent' },
      });
      expect(claimed.isError).not.toBe(true);
      expect(external.status).toBe('running');
      const result = await client.callTool({
        name: 'pagepatch_report_task',
        arguments: {
          taskId: external.id,
          outcome: 'completed',
          summary: '已处理测试批注',
          files: [],
          verification: '测试协议链路，未修改业务文件',
        },
      });
      expect(result.isError).not.toBe(true);
      await panel.locator('#refresh').click();
      await expect(panel.locator('#jobs')).toContainText('Agent 已回报');
      await panel.screenshot({ path: test.info().outputPath('mcp-agent-test.png') });
    } finally {
      await client.close();
    }
  } finally {
    console.log('Closing browser');
    await context.close();
    bridge.close();
    site.close();
    rmSync(directory, { recursive: true, force: true });
    rmSync(projectDirectory, { recursive: true, force: true });
  }
});
