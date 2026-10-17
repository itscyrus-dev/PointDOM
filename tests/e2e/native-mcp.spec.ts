import { expectPrimaryAction, expectTabSurface } from '../fixtures/theme.js';
import { test, expect, chromium } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  cpSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { extensionBrowserArgs } from './browser-args.js';

test('native Rust service and MCP drive extension annotations, progress and exact task ownership', async () => {
  test.setTimeout(120000);
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pointdom-native-e2e-')));
  const state = join(root, 'state');
  mkdirSync(state);
  const token = randomBytes(32).toString('hex');
  const project = randomUUID();
  const website = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      '<!doctype html><title>Native fixture</title><h1 id="heading">Original heading</h1><input value="DO_NOT_CAPTURE"><button id="button">Action</button>',
    );
  });
  await new Promise<void>((done) => website.listen(0, '127.0.0.1', done));
  const address = website.address();
  if (!address || typeof address === 'string') throw Error('No fixture port');
  const origin = `http://127.0.0.1:${address.port}`;
  const reservation = createServer();
  await new Promise<void>((done) => reservation.listen(0, '127.0.0.1', done));
  const local = reservation.address();
  if (!local || typeof local === 'string') throw Error('No port');
  await new Promise<void>((done) => reservation.close(() => done()));
  const base = `http://127.0.0.1:${local.port}`;
  writeFileSync(
    join(state, 'config.json'),
    JSON.stringify({
      version: 1,
      token,
      clients: [],
      projects: [{ id: project, name: 'Native fixture', cwd: root, origins: [origin] }],
      threads: {},
      defaultExecutor: 'codex',
    }),
  );
  const env = { ...process.env, PAGEPATCH_HOME: state, POINTDOM_PORT: String(local.port) };
  const binary = resolve(`target/debug/pointdom${process.platform === 'win32' ? '.exe' : ''}`);
  const service = spawn(binary, ['serve'], { env, stdio: 'ignore' });
  const clients: Client[] = [];
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  try {
    await expect
      .poll(async () => {
        try {
          return (
            await fetch(base + '/api/local/status', {
              headers: { Authorization: `Bearer ${token}`, 'X-PagePatch-Local': '1' },
            })
          ).status;
        } catch {
          return 0;
        }
      })
      .toBe(200);
    const extension = join(root, 'extension');
    cpSync(resolve('dist/extension'), extension, { recursive: true });
    for (const name of ['manifest.json', 'panel.js', 'background.js']) {
      const file = join(extension, name);
      const content = readFileSync(file, 'utf8').replaceAll('http://127.0.0.1:4318', base);
      if (name === 'manifest.json') {
        const manifest = JSON.parse(content);
        manifest.host_permissions.push(origin + '/*');
        writeFileSync(file, JSON.stringify(manifest));
      } else writeFileSync(file, content);
    }
    const client = new Client({ name: 'native-agent', version: 'fixture' });
    clients.push(client);
    await client.connect(
      new StdioClientTransport({
        command: binary,
        args: ['mcp'],
        env: env as Record<string, string>,
      }),
    );
    const definitions = await client.listTools();
    expect(definitions.tools.some((tool) => tool.name === 'pointdom_enable_wakeup')).toBe(true);
    const bind = await client.callTool({
      name: 'pointdom_bind_project',
      arguments: { path: root },
    });
    const text = bind.content as { type: string; text: string }[];
    const bound = JSON.parse(text[0]!.text);
    expect(bound.project.id).toBe(project);

    context = await chromium.launchPersistentContext(join(root, 'profile'), {
      channel: 'chromium',
      headless: true,
      args: extensionBrowserArgs(extension),
    });
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const page = await context.newPage();
    await page.goto(origin);
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 390, height: 850 });
    panel.setDefaultTimeout(5000);
    await panel.goto(`chrome-extension://${new URL(worker.url()).host}/panel.html`);
    await panel.getByRole('button', { name: '高级：手动配对', exact: true }).click();
    await panel.locator('#token').fill(token);
    await panel.locator('#connect').click();
    await expect(panel.locator('#connection')).toContainText('已连接');
    await page.bringToFront();
    await panel.reload();
    await page.bringToFront();
    await panel.evaluate(() =>
      Object.defineProperty(document, 'visibilityState', {
        get: () => 'visible',
        configurable: true,
      }),
    );
    // A fixture client must keep listening while slower runners exercise the UI.
    const waitForTask = async () => {
      for (;;) {
        const result = await client.callTool({
          name: 'pointdom_wait_for_task',
          arguments: { projectId: project, timeoutSeconds: 25 },
        });
        if (result.isError) throw new Error('Fixture MCP wait failed');
        const response = JSON.parse((result.content as { text: string }[])[0]!.text);
        if (!response.timedOut) return result;
      }
    };
    const wait = waitForTask();
    void wait.catch(() => {});
    await panel.locator('#execution-settings').click();
    await expect(panel.getByRole('list', { name: 'CLI 列表' })).toHaveCount(0);
    await expect(panel.getByRole('button', { name: '使用 Codex', exact: true })).toHaveCount(0);
    await panel.getByRole('button', { name: '选择 native-agent', exact: true }).click();
    await page.bringToFront();
    await panel.locator('#pick').click();
    const picker = panel.locator('#pick');
    for (const [appearance, background] of [
      ['浅色', 'rgb(238, 238, 238)'],
      ['深色', 'rgb(52, 56, 60)'],
    ]) {
      await panel.getByRole('radio', { name: appearance, exact: true }).click();
      await expect(picker).toHaveAttribute('aria-pressed', 'true');
      await expect(picker).toHaveCSS('background-color', background!);
      await expect(picker.locator('.picker-indicator')).toHaveCSS('color', 'rgb(207, 246, 146)');
      await picker.hover();
      await expect(picker).toHaveCSS('background-color', background!);
      await panel.mouse.move(0, 0);
    }
    await page.locator('#heading').click();
    const submit = panel.locator('#submit');
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveCSS('background-color', 'rgb(34, 38, 42)');
    await submit.hover({ force: true });
    await expect(submit).toHaveCSS('background-color', 'rgb(34, 38, 42)');
    await panel.getByLabel('Original heading的修改描述').fill('Rename this heading');
    await panel.getByRole('radio', { name: '浅色', exact: true }).click();
    await expectPrimaryAction(panel.locator('#submit'));
    await panel.getByRole('radio', { name: '深色', exact: true }).click();
    await expectPrimaryAction(panel.locator('#submit'));
    await panel.locator('#submit').click();
    const waiting = JSON.parse(((await wait).content as { text: string }[])[0]!.text);
    expect(waiting.taskId).toBeTruthy();
    const taskId = waiting.taskId as string;
    const read = await client.callTool({
      name: 'pointdom_get_task',
      arguments: { projectId: project, taskId },
    });
    const detail = JSON.parse((read.content as { text: string }[])[0]!.text);
    expect(detail.context.elementInstructions[0].description).toBe('Rename this heading');
    expect(JSON.stringify(detail.context)).not.toContain('DO_NOT_CAPTURE');
    await client.callTool({
      name: 'pointdom_claim_task',
      arguments: { projectId: project, taskId, agent: 'native-agent' },
    });
    await client.callTool({
      name: 'pointdom_progress_task',
      arguments: {
        projectId: project,
        taskId,
        stepId: 'read',
        message: 'Located the heading source',
      },
    });
    await expect(panel.locator('.job')).toHaveAttribute('data-status', 'running');
    await expect(panel.locator('.job')).toContainText('Located the heading source');
    const other = new Client({ name: 'other', version: '1' });
    clients.push(other);
    await other.connect(
      new StdioClientTransport({
        command: binary,
        args: ['mcp'],
        env: env as Record<string, string>,
      }),
    );
    await other.callTool({ name: 'pointdom_bind_project', arguments: { path: root } });
    const denied = await other.callTool({
      name: 'pointdom_get_task',
      arguments: { projectId: project, taskId },
    });
    expect(denied.isError).toBe(true);
    const report = {
      projectId: project,
      taskId,
      outcome: 'completed',
      summary: 'Fixture report; no source edits performed',
      files: [],
      verification: 'Protocol and UI verified',
    };
    await client.callTool({ name: 'pointdom_report_task', arguments: report });
    await client.callTool({ name: 'pointdom_report_task', arguments: report });
    await expect(panel.locator('.job')).toHaveAttribute('data-status', 'completed');
    await expect(panel.locator('.job')).toContainText('Fixture report');
    const completedStatus = panel.locator('.job .status-completed');
    const darkStatus = await completedStatus.evaluate((element) => {
      const css = getComputedStyle(element);
      return [css.color, css.backgroundColor];
    });
    await panel.getByRole('radio', { name: '浅色', exact: true }).click();
    await expect(completedStatus).toHaveCSS('color', 'rgb(184, 184, 184)');
    await expect(completedStatus).toHaveCSS('background-color', 'rgb(238, 238, 238)');
    await expect(panel.locator('html')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    for (const card of [panel.locator('.job'), panel.locator('.compose-box')]) {
      await expect(card).toHaveCSS('background-color', 'rgb(248, 248, 248)');
      await expect(card).toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
    }
    await expect(panel.locator('#tab-all')).toHaveCSS('background-color', 'rgb(207, 246, 146)');
    await expect(panel.locator('#tab-all')).toHaveCSS('color', 'rgb(21, 24, 27)');
    await expectTabSurface(panel.locator('#tab-all'), 'rgb(207, 246, 146)');
    await expectTabSurface(panel.locator('#tab-active'), 'rgba(0, 0, 0, 0)');
    await expect(panel.locator('.theme-mode-switch')).toHaveCSS(
      'background-color',
      'rgb(238, 238, 238)',
    );
    const executor = panel.locator('#execution-settings');
    await expect(executor).toHaveCSS('color', 'rgb(184, 184, 184)');
    await panel.mouse.move(0, 0);
    await expect(executor).toHaveCSS('background-color', 'rgb(238, 238, 238)');
    await executor.hover();
    await expect(executor).toHaveCSS('color', 'rgb(40, 43, 48)');
    await expect(executor).toHaveCSS('background-color', 'rgb(238, 238, 238)');
    await panel.mouse.down();
    try {
      await expect(executor).toHaveCSS('background-color', 'rgb(238, 238, 238)');
    } finally {
      await panel.mouse.up();
    }
    await expect(panel.locator('.execution-popover')).toBeVisible();
    await expect(executor).toHaveCSS('background-color', 'rgb(238, 238, 238)');
    await panel.keyboard.press('Escape');
    await panel.locator('#connection-settings').click();
    await expect(panel.locator('#shortcut-pick')).toHaveCSS(
      'background-color',
      'rgb(238, 238, 238)',
    );
    await expect(panel.locator('#shortcut-pick')).toHaveCSS('color', 'rgb(184, 184, 184)');
    await expect(panel.locator('#shortcut-panel')).toHaveCSS(
      'background-color',
      'rgb(238, 238, 238)',
    );
    await expect(panel.locator('#shortcut-panel')).toHaveCSS('color', 'rgb(184, 184, 184)');
    await expect(panel.locator('#pairing-status')).toHaveCSS(
      'background-color',
      'rgb(238, 238, 238)',
    );
    await expect(panel.locator('#pairing-status')).toHaveCSS('color', 'rgb(184, 184, 184)');
    await panel.getByRole('button', { name: '返回批注', exact: true }).click();

    await expect(panel.locator('#instruction')).toHaveCSS('background-color', 'rgb(247, 248, 250)');
    await panel.screenshot({
      path: test.info().outputPath('extension-tasks-light.png'),
      animations: 'disabled',
    });
    await panel.getByRole('radio', { name: '深色', exact: true }).click();
    await expect(completedStatus).toHaveCSS('color', darkStatus[0]!);
    await expect(completedStatus).toHaveCSS('background-color', darkStatus[1]!);
    await expectTabSurface(panel.locator('#tab-all'), 'rgb(207, 246, 146)');
    await expectTabSurface(panel.locator('#tab-active'), 'rgba(0, 0, 0, 0)');
    await panel.screenshot({
      path: test.info().outputPath('extension-tasks-dark.png'),
      animations: 'disabled',
    });

    expect(JSON.parse(readFileSync(join(state, 'config.json'), 'utf8')).defaultExecutor).toBe(
      'mcp',
    );
    const nextWait = waitForTask();
    void nextWait.catch(() => {});
    await page.bringToFront();
    await panel.locator('#pick').click();
    await page.locator('#heading').click();
    await panel.getByLabel('Original heading的修改描述').fill('Cancel this running annotation');
    await panel.locator('#submit').click();
    const nextId = JSON.parse(((await nextWait).content as { text: string }[])[0]!.text).taskId;
    await client.callTool({
      name: 'pointdom_claim_task',
      arguments: { projectId: project, taskId: nextId, agent: 'native-agent' },
    });
    const cancelled = panel.locator('.job').filter({ hasText: 'Cancel this running annotation' });
    await expect(cancelled).toHaveAttribute('data-status', 'running');
    await cancelled.getByRole('button', { name: '取消批注', exact: true }).click();
    await expect(cancelled).toHaveAttribute('data-status', 'cancelled');
    await expect(panel.locator('#notice')).toContainText('批注已取消');
    const late = await client.callTool({
      name: 'pointdom_report_task',
      arguments: { ...report, taskId: nextId },
    });
    expect(late.isError).toBe(true);
    await panel.locator('#refresh').click();
    await expect(cancelled).toHaveAttribute('data-status', 'cancelled');
    const saved = JSON.parse(readFileSync(join(state, 'jobs.json'), 'utf8'));
    expect(saved).toHaveLength(2);
    expect(saved.find((job: { id: string }) => job.id === nextId).status).toBe('cancelled');
  } finally {
    await context?.close();
    service.kill('SIGTERM');
    for (const client of clients) await client.close();
    service.kill('SIGTERM');
    await new Promise<void>((done) =>
      service.exitCode !== null || service.signalCode !== null
        ? done()
        : service.once('exit', () => done()),
    );
    await new Promise<void>((done) => website.close(() => done()));
    rmSync(root, { recursive: true, force: true });
  }
});
