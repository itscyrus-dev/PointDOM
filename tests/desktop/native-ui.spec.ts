import { expectLimeAction, expectTabSurface } from '../fixtures/theme.js';
import { test, expect, chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
const project = {
  id: '00000000-0000-4000-a000-000000000001',
  name: 'Website',
  cwd: '/fixture/website',
  origins: ['http://localhost:3000'],
};
const running = {
  id: '00000000-0000-4000-a000-000000000002',
  projectId: project.id,
  executor: 'mcp',
  instruction: '按独立描述修改 2 个元素',
  status: 'running',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  recipient: { id: '00000000-0000-4000-a000-000000000003', name: 'Codex' },
  selection: { description: '调整导航间距。保留现有配色。' },
  selections: [{ description: '调整导航间距。保留现有配色。' }, { description: '缩小图标。' }],
  result: '',
  events: [{ at: new Date().toISOString(), text: '已定位导航组件' }],
};
test('HeroUI desktop and tray show real supplied state, preserve selection and respect reduced motion', async () => {
  const server = createServer((req, res) => {
    const name = new URL(req.url || '/', 'http://fixture').pathname;
    const file = name === '/' ? 'index.html' : name.slice(1);
    if (
      ![
        'index.html',
        'desktop.css',
        'renderer.js',
        'heroui.css',
        'logo.svg',
        'gravity.svg',
      ].includes(file)
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.setHeader(
      'Content-Type',
      (
        {
          '.js': 'text/javascript',
          '.css': 'text/css',
          '.svg': 'image/svg+xml',
          '.html': 'text/html',
        } as Record<string, string>
      )[extname(file)] || 'text/plain',
    );
    res.end(readFileSync(resolve('dist/desktop-app', file)));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('No port');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(
      ({ project, running }) => {
        const callbacks = new Map<number, (value: unknown) => void>();
        const listeners = new Map<number, string>();
        Object.defineProperty(window, '__TAURI_EVENT_PLUGIN_INTERNALS__', {
          value: { unregisterListener: (_event: string, id: number) => listeners.delete(id) },
        });
        Object.assign(window, {
          fixtureEmit: (event: string, payload: unknown = project) => {
            for (const [id, name] of listeners)
              if (name === event) callbacks.get(id)?.({ event, id, payload });
          },
        });
        let counter = 0;
        let showMenuBarIcon = true;
        let desktopLanguage: 'en' | 'zh-CN' | null = null;
        let discovered = false;
        let addedProject: typeof project | undefined;
        let showPairing = true;
        Object.defineProperty(window, '__TAURI_INTERNALS__', {
          value: {
            metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
            transformCallback: (callback: (v: unknown) => void) => {
              const id = ++counter;
              callbacks.set(id, callback);
              return id;
            },
            unregisterCallback: (id: number) => callbacks.delete(id),
            invoke: async (command: string, args: Record<string, unknown>) => {
              const offline = Boolean(
                (window as unknown as { fixtureOffline?: boolean }).fixtureOffline,
              );
              if (command === 'snapshot')
                return {
                  appVersion: '0.6.0',
                  servicePort: 4318,
                  appSettings: { showMenuBarIcon, language: desktopLanguage },
                  connected: !offline,
                  paired: true,
                  pairingRequests: showPairing
                    ? [{ id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', challenge: 'fixture-challenge' }]
                    : [],
                  projectNames: { [project.id]: project.name },
                  projects: addedProject
                    ? [addedProject]
                    : (window as unknown as { fixtureRemoved?: boolean }).fixtureRemoved
                      ? []
                      : [
                          {
                            ...project,
                            localDiscovery: discovered,
                            origins: discovered
                              ? [
                                  `http://127.0.0.1:${(window as unknown as { fixturePort?: number }).fixturePort || 5173}`,
                                ]
                              : project.origins,
                          },
                        ],
                  discovery: {
                    status:
                      (window as unknown as { fixtureDiscoveryStatus?: string })
                        .fixtureDiscoveryStatus || 'ready',
                    candidates: (window as unknown as { fixtureRemoved?: boolean }).fixtureRemoved
                      ? []
                      : [
                          {
                            id: 'fixture-dev-1',
                            name: 'Detected website',
                            cwd: project.cwd,
                            origins: ['http://127.0.0.1:5173'],
                          },
                        ],
                  },
                  jobs:
                    (window as unknown as { fixtureMany?: boolean }).fixtureMany ||
                    typeof (window as unknown as { fixtureCount?: number }).fixtureCount ===
                      'number'
                      ? Array.from(
                          {
                            length:
                              (window as unknown as { fixtureCount?: number }).fixtureCount ?? 30,
                          },
                          (_, index) => ({
                            ...running,
                            status: (window as unknown as { fixtureCompleted?: boolean })
                              .fixtureCompleted
                              ? 'completed'
                              : running.status,
                            id: `task-${index}`,
                            instruction: `任务 ${index + 1}`,
                          }),
                        )
                      : [running],
                  agents: [
                    {
                      id: running.recipient.id,
                      name: 'Codex',
                      projectId: project.id,
                      wakeable: true,
                    },
                  ],
                  pending: 1,
                  error: offline
                    ? 'PORT_IN_USE: Quit the previous PointDOM service before opening this version.'
                    : null,
                  capabilities: [],
                };
              if (command === 'cancel_job') {
                running.status = 'cancelled';
                return { cancelled: true, notification: 'sent' };
              }
              if (command === 'retry_service') {
                const fixture = window as unknown as {
                  fixtureOffline: boolean;
                  retryCount?: number;
                  finishRetry?: () => void;
                  allowRetry?: boolean;
                };
                fixture.retryCount = (fixture.retryCount || 0) + 1;
                await new Promise<void>((resolve) => {
                  fixture.finishRetry = resolve;
                });
                if (!fixture.allowRetry) throw 'PORT_IN_USE:4318';
                fixture.fixtureOffline = false;
                return null;
              }
              if (command === 'set_menu_bar_visibility') showMenuBarIcon = Boolean(args.visible);
              if (command === 'set_language') {
                desktopLanguage = args.language as 'en' | 'zh-CN';
                for (const [id, name] of listeners)
                  if (name === 'language-changed')
                    callbacks.get(id)?.({ event: name, id, payload: desktopLanguage });
              }
              if (command === 'fit_main_window') {
                (window as unknown as { fittedHeight: number }).fittedHeight = Number(args.height);
                return null;
              }
              if (command === 'plugin:event|listen') {
                listeners.set(Number(args.handler), String(args.event));
                return args.handler;
              }
              if (command === 'plugin:event|unlisten') {
                listeners.delete(Number(args.eventId));
                return null;
              }
              if (command === 'connect_codex')
                return (
                  (window as unknown as { fixtureReloadSuccess?: boolean }).fixtureReloadSuccess !==
                  false
                );
              if (command === 'confirm_discovery') discovered = true;
              if (command === 'remove_project') {
                const fixture = window as unknown as {
                  fixtureApproveRemoval?: boolean;
                  fixtureRemoved?: boolean;
                };
                fixture.fixtureRemoved = Boolean(fixture.fixtureApproveRemoval);
                return fixture.fixtureRemoved;
              }
              if (command === 'add_project') {
                if ((window as unknown as { fixtureAddFails?: boolean }).fixtureAddFails)
                  throw 'Could not save fixture';
                addedProject = {
                  ...project,
                  id: 'manually-added-project',
                  cwd: '/fixture/new-project',
                  name: String(args.name),
                  origins: [String(args.origin)],
                };
              }
              if (command === 'approve_extension') showPairing = false;
              if (command === 'choose_folder') return '/fixture/new-project';
              if (command === 'mcp_configuration')
                return '{"mcpServers":{"pointdom":{"command":"/app/pointdom","args":["mcp"]}}}';
              (window as unknown as { lastNative: unknown }).lastNative = { command, args };
              return null;
            },
          },
        });
      },
      { project, running },
    );
    await page.setViewportSize({ width: 460, height: 640 });
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await expect(page.getByRole('heading', { name: '任务', exact: true })).toBeVisible();
    expect(
      await page.locator('.pairing-notice').evaluate((element) => {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        const label = element.querySelector('strong')!.getBoundingClientRect();
        const button = element.querySelector('button')!.getBoundingClientRect();
        return (
          parseFloat(style.paddingLeft) >= 16 &&
          label.left >= bounds.left + 16 &&
          Math.abs(
            bounds.right -
              button.right -
              parseFloat(style.paddingRight) -
              parseFloat(style.borderRightWidth),
          ) < 1
        );
      }),
    ).toBe(true);
    expect(
      await page
        .locator('main')
        .evaluate(
          (element) =>
            !element.dispatchEvent(
              new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
            ),
        ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath('pairing-padding-dark.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: '允许连接', exact: true }).click();
    expect(
      await page.evaluate(() => (window as unknown as { lastNative: unknown }).lastNative),
    ).toEqual({
      command: 'approve_extension',
      args: { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', challenge: 'fixture-challenge' },
    });
    await expect(page.getByRole('button', { name: '允许连接', exact: true })).toHaveCount(0);
    await expect(page.locator('.app-toast')).toContainText('已允许连接');
    await expect(page.locator('.workspace > .notice')).toHaveCount(0);
    await expect
      .poll(() =>
        page.locator('.app-toast').evaluate((element) => {
          const footer = document.querySelector('.app-footer')!;
          return element.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top - 8;
        }),
      )
      .toBe(true);
    await page.screenshot({
      path: test.info().outputPath('toast-dark.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: '关闭提示', exact: true }).click();
    await expect(page.locator('.app-toast')).toHaveCount(0);

    await expect(page.getByRole('tablist', { name: '主导航' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '任务' })).toHaveAttribute('aria-selected', 'true');
    expect(
      await page
        .locator('.app-tab .ui-icon')
        .first()
        .evaluate((element) =>
          element instanceof SVGGraphicsElement ? element.getBBox().width : 0,
        ),
    ).toBeGreaterThan(0);
    const tabAlignment = await page.locator('.app-tab').evaluateAll((tabs) =>
      tabs.map((tab) => {
        const icon = tab.querySelector<SVGSVGElement>('.ui-icon')!;
        const label = tab.querySelector('span')!.getBoundingClientRect();
        const glyph = icon.getBBox();
        const matrix = icon.getScreenCTM()!;
        const center = new DOMPoint(
          glyph.x + glyph.width / 2,
          glyph.y + glyph.height / 2,
        ).matrixTransform(matrix);
        return Math.abs(center.x - (label.left + label.width / 2));
      }),
    );
    expect(Math.max(...tabAlignment)).toBeLessThan(0.5);
    await page.getByRole('button', { name: /调整导航间距/ }).click();
    await expect(page.getByText('已定位导航组件', { exact: true })).toBeVisible();
    await expect(page.locator('.app-tab[data-selected="true"]')).toHaveCSS(
      'color',
      'rgb(238, 239, 240)',
    );
    await expect(page.locator('.app-tab[data-selected="true"]')).toHaveCSS(
      'background-color',
      'rgb(32, 34, 36)',
    );
    await page.screenshot({ path: test.info().outputPath('desktop-dark.png') });
    await expect(page.locator('.app-toolbar img')).toHaveCount(0);
    await expect(page.locator('.app-toolbar button:visible')).toHaveCount(0);
    const tab = page.getByRole('tab', { name: '设置', exact: true });
    const before = await tab.boundingBox();
    await tab.hover();
    await expectTabSurface(tab, 'rgba(0, 0, 0, 0)');
    expect(await tab.boundingBox()).toEqual(before);
    expect(before?.width).toBeLessThanOrEqual(72);
    await tab.click();
    const themeControls = page.getByRole('radiogroup', { name: '主题', exact: true });
    await expect(themeControls.getByRole('radio')).toHaveCount(3);
    const lightTheme = themeControls.getByRole('radio', { name: '浅色', exact: true });
    const darkTheme = themeControls.getByRole('radio', { name: '深色', exact: true });
    const systemTheme = themeControls.getByRole('radio', { name: '跟随系统', exact: true });
    await expect(darkTheme).toHaveAttribute('aria-checked', 'true');
    await expect(lightTheme).toHaveText('');
    await expect(lightTheme.locator('svg')).toHaveCount(1);
    await page.emulateMedia({ colorScheme: 'dark' });
    await systemTheme.click();
    await expect(systemTheme).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    expect(await page.evaluate(() => localStorage.getItem('pointdom-theme'))).toBe('system');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await page.getByRole('button', { name: /调整导航间距/ }).click();
    await page.getByRole('tab', { name: '设置', exact: true }).click();
    await expect(systemTheme).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await darkTheme.click();
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await darkTheme.click();
    await expect(darkTheme).toHaveAttribute('aria-checked', 'true');
    const languageControl = page.getByRole('button', { name: '选择语言', exact: true });
    await expect(languageControl).toHaveText('');
    await expect(languageControl.locator('svg')).toHaveCount(1);
    await languageControl.focus();
    await languageControl.press('Enter');
    await expect(page.getByRole('menu', { name: '选择语言' })).toBeVisible();
    await expect(page.getByRole('menuitemradio', { name: '简体中文' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const englishOption = page.getByRole('menuitemradio', { name: 'English' });
    await englishOption.hover();
    expect(
      await englishOption.evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.backgroundColor, style.outlineStyle, style.boxShadow, style.borderWidth];
      }),
    ).toEqual(['rgba(0, 0, 0, 0)', 'none', 'none', '0px']);
    await page.screenshot({
      path: test.info().outputPath('language-dark-hover.png'),
      animations: 'disabled',
    });
    await page.keyboard.press('ArrowDown');
    const keyboardOption = page.locator('.language-popover [data-focus-visible="true"]');
    await expect(keyboardOption).toHaveCount(1);
    expect(
      await keyboardOption.evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.outlineStyle, style.outlineOffset];
      }),
    ).toEqual(['solid', '-2px']);
    await englishOption.click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(
      await page.evaluate(() => (window as unknown as { lastNative: unknown }).lastNative),
    ).toEqual({ command: 'set_language', args: { language: 'en' } });
    await page.getByRole('button', { name: 'Choose a language', exact: true }).press('Enter');
    await page.getByRole('menuitemradio', { name: '简体中文' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    expect(
      await page.evaluate(() => (window as unknown as { lastNative: unknown }).lastNative),
    ).toEqual({ command: 'set_language', args: { language: 'zh-CN' } });
    await expect(page.getByText(/关闭窗口后继续运行/)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'APP 设置' })).toHaveCount(0);
    await expect(page.getByText('在 Dock 中显示', { exact: true })).toHaveCount(0);
    const appearance = page
      .locator('.panel-card')
      .filter({ has: page.getByRole('heading', { name: '外观', exact: true }) });
    const menuBar = appearance.getByRole('switch', { name: '显示菜单栏图标' });
    await expect(menuBar).toBeChecked();
    await page.locator('.menu-bar-setting .switch__content').click();
    await expect(menuBar).not.toBeChecked();
    expect(
      await page.evaluate(() => (window as unknown as { lastNative: unknown }).lastNative),
    ).toEqual({ command: 'set_menu_bar_visibility', args: { visible: false } });
    await page.locator('.menu-bar-setting .switch__content').click();
    await expect(menuBar).toBeChecked();
    await lightTheme.click();
    await expect
      .poll(() => lightTheme.evaluate((element) => getComputedStyle(element).backgroundColor))
      .toBe('rgb(252, 252, 253)');
    const themeFill = await lightTheme.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    await lightTheme.hover();
    expect(await lightTheme.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
      themeFill,
    );
    await languageControl.click();
    await englishOption.hover();
    await page.screenshot({
      path: test.info().outputPath('language-light-hover.png'),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: '任务', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect
      .poll(() =>
        page
          .locator('.project-filters .button')
          .first()
          .evaluate((element) => getComputedStyle(element).backgroundColor),
      )
      .toBe('rgb(244, 244, 245)');
    await expect(page.locator('.app-tab[data-selected="true"]')).toHaveCSS(
      'color',
      'rgb(40, 43, 48)',
    );
    await expect(page.locator('.app-tab[data-selected="true"]')).toHaveCSS(
      'background-color',
      'rgb(244, 244, 245)',
    );
    await expect(page.locator('.status-running').first()).toHaveCSS('color', 'rgb(69, 97, 43)');
    await expect(page.locator('.status-running').first()).toHaveCSS(
      'background-color',
      'rgb(239, 245, 231)',
    );
    await expectTabSurface(page.locator('.project-filters .button').first(), 'rgb(244, 244, 245)');
    await expectTabSurface(
      page.locator('.filter-controls .button[aria-pressed="false"]'),
      'rgba(0, 0, 0, 0)',
    );
    await expectTabSurface(
      page.getByRole('tab', { name: '设置', exact: true }),
      'rgba(0, 0, 0, 0)',
    );
    await expect(page.locator('.summary-grid')).toHaveCSS('border-top-color', 'rgb(217, 223, 225)');
    await page.screenshot({
      path: test.info().outputPath('desktop-light.png'),
      animations: 'disabled',
    });
    await page.getByRole('tab', { name: '设置', exact: true }).click();
    await expect(page.locator('.menu-bar-setting .switch__control')).toHaveCSS(
      'background-color',
      'rgb(168, 255, 0)',
    );
    await darkTheme.click();
    await expect(page.locator('.menu-bar-setting .switch__control')).toHaveCSS(
      'background-color',
      'rgb(168, 255, 0)',
    );
    await expect(page.locator('.app-tab[data-selected="true"]')).toHaveCSS(
      'color',
      'rgb(238, 239, 240)',
    );
    await lightTheme.click();
    await page.getByRole('tab', { name: '客户端', exact: true }).click();
    await expect(page.getByRole('heading', { name: '连接客户端' })).toBeVisible();
    await page.getByRole('button', { name: '配置', exact: true }).click();
    await expect(
      page.getByText('配置已刷新。在目标对话启用任务唤醒。', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/重启 Codex/)).toHaveCount(0);
    await page.evaluate(() => {
      (window as unknown as { fixtureReloadSuccess: boolean }).fixtureReloadSuccess = false;
    });
    await page.getByRole('button', { name: '配置', exact: true }).click();
    await expect(
      page.getByText(
        '已保存。首次使用请在 Codex 的 MCP servers 中启用 PointDOM，并点击 Restart。',
        { exact: true },
      ),
    ).toBeVisible();

    await page.getByRole('button', { name: '连接配置', exact: true }).click();
    await expect(page.locator('.config-output')).toContainText('mcpServers');
    await page.getByRole('tab', { name: '项目', exact: true }).click();
    await expect(page.getByRole('textbox', { name: '项目名称' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '项目', exact: true })).toBeVisible();
    await expect(page.getByText('启动开发服务后，项目会自动出现。', { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByRole('button', { name: '选择源码文件夹', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: '连接项目', exact: true }).click();
    expect(
      await page.evaluate(() => (window as unknown as { lastNative: unknown }).lastNative),
    ).toEqual({ command: 'confirm_discovery', args: { id: 'fixture-dev-1' } });
    await expect(page.getByRole('button', { name: '连接项目', exact: true })).toHaveCount(0);
    await page.evaluate(() => {
      (window as unknown as { fixturePort: number }).fixturePort = 5174;
    });
    await expect(page.locator('.project-grid')).toContainText('http://127.0.0.1:5174');
    await expect(page.getByRole('button', { name: '连接项目', exact: true })).toHaveCount(0);
    await page.setViewportSize({ width: 400, height: 640 });
    const projectActions = page.locator('.project-actions');
    expect(
      await projectActions.locator('button').evaluateAll((buttons) => {
        const boxes = buttons.map((button) => button.getBoundingClientRect());
        return (
          boxes.length === 3 &&
          boxes.every((box) => Math.abs(box.top - boxes[0]!.top) < 1 && box.height >= 34)
        );
      }),
    ).toBe(true);
    const copyButton = page.getByRole('button', { name: '复制 Codex 连接指令', exact: true });
    await copyButton.hover();
    await expect(
      page.getByRole('tooltip', { name: '复制连接指令，在目标 Codex 对话粘贴发送', exact: true }),
    ).toBeVisible();
    const copyBounds = await copyButton.boundingBox();
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            (window as unknown as { copiedText: string }).copiedText = text;
          },
        },
      }),
    );
    await copyButton.click();
    await expect(copyButton).toContainText('已复制');
    await expect(copyButton.locator('use')).toHaveAttribute('href', 'gravity.svg#check');
    expect(await copyButton.boundingBox()).toEqual(copyBounds);
    expect(
      await page.evaluate(() => (window as unknown as { copiedText: string }).copiedText),
    ).toContain(project.cwd);
    await expect(page.locator('.app-toast')).toHaveCount(0);
    await page.screenshot({
      path: test.info().outputPath('projects-copied-compact.png'),
      animations: 'disabled',
    });
    await expect(copyButton).toContainText('复制', { timeout: 4000 });
    await expect(copyButton.locator('use')).toHaveAttribute('href', 'gravity.svg#copy');
    expect(await copyButton.boundingBox()).toEqual(copyBounds);
    await page.setViewportSize({ width: 460, height: 640 });
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));
    await page.getByRole('button', { name: '打开网页', exact: true }).click();
    expect(
      await page.evaluate(() => (window as unknown as { lastNative: unknown }).lastNative),
    ).toEqual({ command: 'open_project', args: { id: project.id } });
    await page.getByRole('button', { name: '复制 Codex 连接指令', exact: true }).click();
    await expect(page.locator('.config-output')).toContainText(project.cwd);
    await expect(page.locator('.config-output')).toContainText(project.id);
    await page.getByRole('tab', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '手动添加项目', exact: true }).click();
    const addAction = page.locator('#manual-project-form button[type="submit"]');
    await expect(addAction).toBeDisabled();
    await expect(addAction).toHaveCSS('background-color', 'rgb(237, 237, 240)');
    await page.getByRole('button', { name: '选择源码文件夹' }).click();
    await expect(page.getByText('/fixture/new-project', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: '网页地址' }).fill('http://localhost:3001');
    await expectLimeAction(addAction);
    await darkTheme.click();
    await expectLimeAction(addAction);
    await lightTheme.click();
    await page.getByRole('textbox', { name: '网页地址' }).fill('');

    await page.getByRole('tab', { name: '设置', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Chrome 扩展' })).toBeVisible();
    const settingsHeight = await page.evaluate(() => {
      const content = document.querySelector(
        '.app-panel[data-screen="settings"] > .panel-content',
      )!;
      const toolbar = document.querySelector('.app-toolbar')!;
      const footer = document.querySelector('.app-footer')!;
      return Math.ceil(
        content.getBoundingClientRect().height +
          toolbar.getBoundingClientRect().height +
          footer.getBoundingClientRect().height +
          [...document.querySelectorAll('.workspace > .notice')].reduce(
            (sum, notice) => sum + notice.getBoundingClientRect().height + 12,
            0,
          ) +
          36,
      );
    });
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { fittedHeight: number }).fittedHeight))
      .toBe(settingsHeight);

    await page.screenshot({
      path: test.info().outputPath('settings-light.png'),
      animations: 'disabled',
    });
    await page.getByRole('tab', { name: '关于', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'PointDOM', exact: true })).toBeVisible();
    await expect(page.locator('.version-badge')).toHaveText('版本 0.6.0');
    await page.screenshot({
      path: test.info().outputPath('about-light.png'),
      animations: 'disabled',
    });
    const aboutLink = page.getByRole('button', { name: /项目主页/ });
    const linkFill = await aboutLink.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    await aboutLink.hover();
    expect(await aboutLink.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
      linkFill,
    );
    await expect(page.getByRole('button', { name: /发布版本/ })).toContainText('0.6.0');
    await page.getByRole('button', { name: /发布版本/ }).click();
    expect(
      await page.evaluate(() => (window as unknown as { lastNative: unknown }).lastNative),
    ).toEqual({ command: 'open_resource', args: { resource: 'releases' } });
    await page.evaluate(() => {
      (window as unknown as { fixtureOffline: boolean }).fixtureOffline = true;
    });
    await expect(page.locator('.app-footer')).toContainText('服务未连接');
    await expect(page.locator('.version-badge')).toHaveText('版本 0.6.0');
    await expect(page.locator('.workspace > [role="alert"]')).toHaveCount(0);
    await page.getByRole('tab', { name: '任务' }).click();
    await expect(page.locator('.workspace > [role="alert"]')).toContainText('端口 4318 已被占用');
    await expect(page.locator('.workspace > [role="alert"]')).not.toContainText('PORT_IN_USE');
    await page.getByRole('button', { name: '重新连接', exact: true }).click();
    await expect(page.getByRole('button', { name: '正在重连…', exact: true })).toHaveAttribute(
      'data-pending',
      'true',
    );
    await expect(page.locator('.workspace > .notice[role="status"]')).toContainText('正在重新连接');
    await page.getByRole('button', { name: '正在重连…', exact: true }).press('Enter');
    expect(
      await page.evaluate(() => (window as unknown as { retryCount: number }).retryCount),
    ).toBe(1);
    await page.evaluate(() => {
      (window as unknown as { finishRetry: () => void }).finishRetry();
    });
    await expect(page.locator('.workspace > [role="alert"]')).toContainText(
      '重连失败：端口 4318 仍被占用',
    );
    await expect(page.getByRole('button', { name: '重新连接', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '重新连接', exact: true }).click();
    await page.evaluate(() => {
      const fixture = window as unknown as { allowRetry: boolean; finishRetry: () => void };
      fixture.allowRetry = true;
      fixture.finishRetry();
    });
    await expect(page.locator('.workspace > [role="alert"]')).toHaveCount(0);
    await expect(page.locator('.app-toast')).toContainText('已重新连接');
    await expect(page.locator('.app-footer')).toContainText('服务已连接');
    await page.getByRole('tab', { name: '关于' }).click();
    await expect(page.locator('.app-toast')).toHaveCount(0);
    await page.getByRole('tab', { name: '关于', exact: true }).press('ArrowLeft');
    await expect(page.getByRole('tab', { name: '设置', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('tab', { name: '设置', exact: true }).press('ArrowLeft');
    await expect(page.getByRole('tab', { name: '客户端' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('tab', { name: '客户端' }).press('ArrowLeft');
    await expect(page.getByRole('heading', { name: '项目', exact: true })).toBeVisible();
    await expect(page.getByText('启动开发服务后，项目会自动出现。', { exact: true })).toHaveCount(
      0,
    );
    await page.getByRole('tab', { name: '设置', exact: true }).click();
    await expect(page.getByText('/fixture/new-project', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: '项目', exact: true }).click();
    await page.setViewportSize({ width: 400, height: 520 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(() =>
      (window as unknown as { fixtureEmit: (event: string) => void }).fixtureEmit('project-bound'),
    );
    await expect(page.getByRole('textbox', { name: '项目名称' })).toHaveCount(0);
    await expect(page.locator('.app-toast .toast__title')).toHaveText(
      '项目已绑定，返回网页允许访问即可。',
    );
    // Repeated identical feedback must still appear after the previous toast expired.
    await expect(page.locator('.app-toast')).toHaveCount(0, { timeout: 6000 });
    await page.evaluate(() =>
      (window as unknown as { fixtureEmit: (event: string) => void }).fixtureEmit('project-bound'),
    );
    await expect(page.locator('.app-toast')).toContainText('项目已绑定');
    await page.getByRole('tab', { name: '关于' }).click();
    await expect(page.locator('.app-toast')).toHaveCount(0);
    await expect(page.getByRole('tablist')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('tab', { name: '任务' }).click();
    await expect(page.getByText('已定位导航组件', { exact: true })).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath('desktop-narrow.png'),
      animations: 'disabled',
    });
    await page.setViewportSize({ width: 460, height: 1200 });
    await page.evaluate(() => {
      (window as unknown as { fixtureCount: number }).fixtureCount = 5;
    });
    await expect(page.locator('.task-entry')).toHaveCount(5);
    const fiveCardHeight = await page.locator('.task-list').evaluate((element) => {
      const style = getComputedStyle(element);
      const cards = [...element.querySelectorAll('.task-card')];
      return (
        cards.reduce((sum, card) => sum + card.getBoundingClientRect().height, 0) +
        parseFloat(style.rowGap) * 4 +
        parseFloat(style.paddingTop) +
        parseFloat(style.paddingBottom)
      );
    });
    await expect
      .poll(() =>
        page.locator('.task-list').evaluate((element) => element.getBoundingClientRect().height),
      )
      .toBe(fiveCardHeight);
    const fiveCardWindow = await page.evaluate(
      () => (window as unknown as { fittedHeight: number }).fittedHeight,
    );
    expect(fiveCardWindow).toBeLessThan(1100);
    await page.setViewportSize({ width: 460, height: fiveCardWindow });
    await expect
      .poll(() =>
        page.locator('.task-list').evaluate((element) => element.getBoundingClientRect().height),
      )
      .toBe(fiveCardHeight);
    await expect
      .poll(() =>
        page
          .locator('.task-list')
          .evaluate((element) => element.scrollHeight - element.clientHeight),
      )
      .toBeLessThanOrEqual(1);
    const taskEdges = await page.locator('.task-list').evaluate((element) => {
      const header = document.querySelector('.list-heading')!.getBoundingClientRect();
      const card = element.querySelector('.task-card')!.getBoundingClientRect();
      const list = element.getBoundingClientRect();
      return {
        left: Math.abs(card.left - header.left),
        right: Math.abs(card.right - header.right),
        gutter: list.right - card.right,
      };
    });
    expect.soft(taskEdges.left).toBeLessThanOrEqual(1);
    expect.soft(taskEdges.right).toBeLessThanOrEqual(1);
    expect.soft(taskEdges.gutter).toBeGreaterThanOrEqual(10);
    await page.evaluate(() => {
      (window as unknown as { fixtureCompleted: boolean }).fixtureCompleted = true;
    });
    await expect(page.locator('.task-card[data-status="completed"]')).toHaveCount(5);
    const filterFrames = await page.evaluate(async () => {
      const list = document.querySelector('.task-list')!;
      const buttons = [...document.querySelectorAll<HTMLButtonElement>('.filter-controls button')];
      const samples: { count: number; overflow: number; widthDelta: number }[] = [];
      for (let round = 0; round < 3; round++) {
        for (const label of ['进行中', '全部']) {
          buttons.find((button) => button.textContent === label)!.click();
          for (let frame = 0; frame < 2; frame++) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            samples.push({
              count: list.querySelectorAll('.task-card').length,
              overflow: list.scrollHeight - list.clientHeight,
              widthDelta: Math.abs(
                list.querySelector('.task-card, .empty')!.getBoundingClientRect().right -
                  document.querySelector('.list-heading')!.getBoundingClientRect().right,
              ),
            });
          }
        }
      }
      return samples;
    });
    expect(filterFrames.some((frame) => frame.count === 0)).toBe(true);
    expect(filterFrames.some((frame) => frame.count === 5)).toBe(true);
    expect.soft(Math.max(...filterFrames.map((frame) => frame.overflow))).toBeLessThanOrEqual(1);
    expect(Math.max(...filterFrames.map((frame) => frame.widthDelta))).toBeLessThanOrEqual(1);
    await page.evaluate(() => {
      (window as unknown as { fixtureCompleted: boolean }).fixtureCompleted = false;
    });
    await page.screenshot({
      path: test.info().outputPath('tasks-five-fit.png'),
      animations: 'disabled',
    });
    await page.evaluate(() => {
      (window as unknown as { fixtureCount: number }).fixtureCount = 6;
    });
    await expect(page.locator('.task-entry')).toHaveCount(6);
    await expect
      .poll(() =>
        page.locator('.task-list').evaluate((element) => element.getBoundingClientRect().height),
      )
      .toBe(fiveCardHeight);
    expect(
      await page.evaluate(() => (window as unknown as { fittedHeight: number }).fittedHeight),
    ).toBe(fiveCardWindow);
    expect(
      await page
        .locator('.task-list')
        .evaluate((element) => element.scrollHeight > element.clientHeight),
    ).toBe(true);
    await page.evaluate(() => {
      (window as unknown as { fixtureCount: number }).fixtureCount = 1;
    });
    await expect(page.locator('.task-entry')).toHaveCount(1);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { fittedHeight: number }).fittedHeight))
      .toBeLessThan(fiveCardWindow);
    await page.evaluate(() => {
      delete (window as unknown as { fixtureCount?: number }).fixtureCount;
    });
    await page.setViewportSize({ width: 400, height: 480 });
    await page.getByRole('button', { name: '全部项目', exact: true }).click();
    await page.evaluate(() => {
      (window as unknown as { fixtureMany: boolean }).fixtureMany = true;
    });
    await expect(page.locator('.task-list .task-card')).toHaveCount(30);
    for (const width of [400, 1000, 400]) {
      await page.setViewportSize({ width, height: 480 });
      await page.evaluate(async () => {
        // Let the resize observer and its scheduled measurement finish before snapshots.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      });
      const alignment = await page.locator('.task-list').evaluate((element) => {
        const heading = document.querySelector('.list-heading')!.getBoundingClientRect();
        const summary = document.querySelector('.summary-grid')!.getBoundingClientRect();
        const card = element.querySelector('.task-card')!.getBoundingClientRect();
        const list = element.getBoundingClientRect();
        return {
          left: Math.max(Math.abs(card.left - heading.left), Math.abs(card.left - summary.left)),
          right: Math.max(
            Math.abs(card.right - heading.right),
            Math.abs(card.right - summary.right),
          ),
          scrollbarInsideWindow: list.right <= innerWidth - 6,
        };
      });
      expect(alignment.left).toBeLessThanOrEqual(1);
      expect(alignment.right).toBeLessThanOrEqual(1);
      expect(alignment.scrollbarInsideWindow).toBe(true);
    }

    const secondEntry = page.locator('.task-entry').nth(1);
    await expect(page.locator('.task-number').first()).toHaveText('30');
    await expect(secondEntry.locator('.task-number')).toHaveText('29');
    await expect(page.locator('.task-number').last()).toHaveText('1');
    const listHeight = await page.locator('.task-list').evaluate((element) => element.clientHeight);
    const fittedBefore = await page.evaluate(
      () => (window as unknown as { fittedHeight: number }).fittedHeight,
    );
    await secondEntry.getByRole('button').first().click();
    await expect(secondEntry.locator('.task-detail')).toHaveCount(1);
    await expect
      .poll(() =>
        secondEntry
          .locator('.task-expansion')
          .evaluate((element) => (element as HTMLElement).style.height),
      )
      .toBe('auto');
    expect(await page.locator('.task-list').evaluate((element) => element.clientHeight)).toBe(
      listHeight,
    );
    expect(
      await page.evaluate(() => (window as unknown as { fittedHeight: number }).fittedHeight),
    ).toBe(fittedBefore);
    await expect(secondEntry.getByRole('button').first()).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.task-detail')).toHaveCount(1);
    const collapse = secondEntry.getByRole('button', { name: '收起', exact: true });
    await collapse.click();
    await expect(page.locator('.task-detail')).toHaveCount(0);
    await expect(secondEntry.getByRole('button').first()).toBeFocused();
    const list = page.locator('.task-list');
    expect(
      await list.evaluate(
        (element) => element.scrollHeight > element.clientHeight && element.clientHeight > 60,
      ),
    ).toBe(true);
    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await page.getByRole('button', { name: /任务 30 / }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: /任务 30 / })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
      true,
    );
    expect(
      await page.locator('.workspace').evaluate((element) => getComputedStyle(element).overflowY),
    ).toBe('hidden');
    expect(
      await list.evaluate((element) => getComputedStyle(element, '::-webkit-scrollbar').width),
    ).toBe('6px');
    await page.screenshot({
      path: test.info().outputPath('tasks-scroll.png'),
      animations: 'disabled',
    });
    await page.getByRole('tab', { name: '设置', exact: true }).click();
    await page.locator('.menu-bar-setting .switch__content').scrollIntoViewIfNeeded();
    await expect(page.locator('.menu-bar-setting .switch__content')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
      true,
    );
    await page.getByRole('button', { name: '选择语言', exact: true }).click();
    await expect(page.getByRole('menuitemradio', { name: '简体中文' })).toBeInViewport();
    await page.screenshot({
      path: test.info().outputPath('language-menu.png'),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await page.evaluate(() =>
      (window as unknown as { fixtureEmit: (event: string, payload: string) => void }).fixtureEmit(
        'open-screen',
        'about',
      ),
    );
    await expect(page.getByRole('tab', { name: '关于', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.evaluate(() =>
      (window as unknown as { fixtureEmit: (event: string, payload: string) => void }).fixtureEmit(
        'open-screen',
        'invalid-screen',
      ),
    );
    await expect(page.getByRole('tab', { name: '关于', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('tab', { name: '项目', exact: true }).click();
    await page.getByRole('button', { name: '移除项目', exact: true }).click();
    await expect(page.locator('.project-card')).toHaveCount(1);
    await page.evaluate(() => {
      (window as unknown as { fixtureApproveRemoval: boolean }).fixtureApproveRemoval = true;
    });
    await page.getByRole('button', { name: '移除项目', exact: true }).click();
    await expect(page.locator('.project-card')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '连接项目', exact: true })).toHaveCount(0);
    await expect(page.getByText('暂无项目', { exact: true })).toBeVisible();
    const emptyProjects = page.locator('[data-screen="projects"] .empty');
    await expect(emptyProjects.locator('p')).toHaveText('添加本地项目即可开始。');
    await expect(
      emptyProjects.getByRole('button', { name: '添加项目', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.projects-heading button')).toHaveCount(0);
    const emptyLayout = await emptyProjects.evaluate((element) => {
      const description = element.querySelector('p')!.getBoundingClientRect();
      const button = element.querySelector('button')!.getBoundingClientRect();
      const card = element.getBoundingClientRect();
      return {
        below: button.top >= description.bottom,
        centered: Math.abs((button.left + button.right) / 2 - (card.left + card.right) / 2) < 1,
      };
    });
    expect(emptyLayout).toEqual({ below: true, centered: true });
    await page.screenshot({ path: test.info().outputPath('projects-empty.png') });
    await page.evaluate(() => {
      (window as unknown as { fixtureOffline: boolean }).fixtureOffline = true;
    });
    await expect(page.getByText('连接服务后可添加项目。', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '添加项目', exact: true })).toBeDisabled();
    await page.evaluate(() => {
      (window as unknown as { fixtureOffline: boolean }).fixtureOffline = false;
    });
    for (const status of ['scanning', 'unavailable', 'unsupported']) {
      await page.evaluate((status) => {
        (window as unknown as { fixtureDiscoveryStatus: string }).fixtureDiscoveryStatus = status;
      }, status);
      await expect(emptyProjects.locator('p')).toHaveText('添加本地项目即可开始。');
      await expect(page.getByRole('button', { name: '添加项目', exact: true })).toBeEnabled();
    }
    await page.evaluate(() => {
      (window as unknown as { fixtureEmit: (event: string, payload: string) => void }).fixtureEmit(
        'language-changed',
        'en',
      );
    });
    await expect(page.getByText('No projects', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add project', exact: true })).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { fixtureEmit: (event: string, payload: string) => void }).fixtureEmit(
        'language-changed',
        'zh-CN',
      );
    });
    await page.getByRole('button', { name: '添加项目', exact: true }).click();
    await expect(page.getByRole('tab', { name: '设置', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('button', { name: '手动添加项目', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await page.getByRole('button', { name: '选择源码文件夹' }).click();
    await page.getByRole('textbox', { name: '网页地址' }).fill('http://localhost:3001');
    await page.evaluate(() => {
      (window as unknown as { fixtureAddFails: boolean }).fixtureAddFails = true;
    });
    await page.getByRole('button', { name: '添加项目', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Could not save fixture');
    await expect(page.getByRole('textbox', { name: '网页地址' })).toHaveValue(
      'http://localhost:3001',
    );
    await expect(page.getByText('/fixture/new-project', { exact: true })).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { fixtureAddFails: boolean }).fixtureAddFails = false;
    });
    await page.getByRole('button', { name: '添加项目', exact: true }).click();
    expect(
      await page.evaluate(() => (window as unknown as { lastNative: unknown }).lastNative),
    ).toEqual({
      command: 'add_project',
      args: { name: 'new-project', origin: 'http://localhost:3001' },
    });
    await expect(page.getByRole('tab', { name: '项目', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.locator('.project-card')).toContainText('new-project');
    await expect(page.locator('.project-card')).toContainText('http://localhost:3001');
    await expect(page.getByText('暂无项目', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '添加项目', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: '任务', exact: true }).click();
    await expect(page.locator('.task-card').first()).toContainText(project.name);
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await page.getByRole('button', { name: /调整导航间距/ }).click();
    await page.getByRole('button', { name: '取消批注', exact: true }).click();
    await expect(page.locator('.task-card')).toContainText('已取消');
    await expect(page.getByRole('alert')).toContainText('已向 Codex 发送停止请求');
    await page.goto(`http://127.0.0.1:${address.port}/?view=tray`);
    await page.setViewportSize({ width: 380, height: 520 });
    await expect(page.locator('.tray-shell')).toBeVisible();
    await expect(page.locator('html')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(page.locator('.tray-shell')).toHaveCSS('border-radius', '16px');
    await expect(page.locator('.tray-shell')).toHaveCSS('overflow', 'hidden');
    await page.evaluate(() =>
      (window as unknown as { fixtureEmit: (event: string, payload: string) => void }).fixtureEmit(
        'language-changed',
        'en',
      ),
    );
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('button', { name: 'All tasks', exact: true })).toBeVisible();
    await page.evaluate(() =>
      (window as unknown as { fixtureEmit: (event: string, payload: string) => void }).fixtureEmit(
        'language-changed',
        'zh-CN',
      ),
    );
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await page.screenshot({ path: test.info().outputPath('tray.png') });
    await page.getByRole('button', { name: /调整导航间距/ }).click();
    expect(
      await page.evaluate(
        () => (window as unknown as { lastNative: { command: string } }).lastNative.command,
      ),
    ).toBe('open_main');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(
      await page.locator('.task-orbit').evaluate((e) => getComputedStyle(e).animationName),
    ).toBe('none');
    expect(errors).toEqual([]);
  } finally {
    await browser.close();
    await new Promise<void>((done) => server.close(() => done()));
  }
});
