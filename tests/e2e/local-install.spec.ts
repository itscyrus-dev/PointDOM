import { expectPrimaryAction } from '../fixtures/theme.js';
import { test, expect } from '@playwright/test';
import { nativeFixture } from '../fixtures/native.js';

test('unbound local page shows a prominent binding action in the panel without page permissions', async () => {
  const fixture = await nativeFixture('<!doctype html><h1>Binding fixture</h1>');
  try {
    const { context, origin } = fixture;
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).host;
    const panel = await context.newPage();
    let linked = false;
    await panel.route('**/api/projects', (route) =>
      route.fulfill({
        json: {
          projects: linked ? [fixture.project] : [],
          agentSettings: { defaultExecutor: 'mcp' },
        },
      }),
    );
    await panel.addInitScript((origin) => {
      Object.defineProperty(chrome.tabs, 'query', {
        value: async () => [{ id: 7, url: `${origin}/fixture?private=value#fragment` }],
      });
      Object.defineProperty(chrome.tabs, 'get', {
        value: async () => ({ id: 7, url: `${origin}/fixture?private=value#fragment` }),
      });
      // Never open the OS scheme handler or request permissions during this test.
      Object.defineProperty(chrome.tabs, 'create', {
        value: async () => {
          throw new Error('Binding must not open a browser tab');
        },
      });
      window.open = (url, target) => {
        document.documentElement.dataset.handoff = String(url);
        document.documentElement.dataset.handoffTarget = String(target);
        return window;
      };
      Object.defineProperty(chrome.permissions, 'request', {
        value: async () => {
          throw new Error('Binding must not request page access');
        },
      });
    }, origin);
    await panel.setViewportSize({ width: 380, height: 760 });
    await panel.goto(`chrome-extension://${id}/panel.html`);
    const challenge = await panel.evaluate(async () => {
      const { nonce } = await chrome.runtime.sendMessage({ type: 'POINTDOM_CONNECTION_NONCE' });
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce));
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
        '',
      );
    });
    await fixture.local('/bootstrap', { extensionId: id, challenge });
    await expect(panel.locator('#connection')).toHaveText('已连接', { timeout: 15000 });
    const binding = panel.getByRole('button', { name: '绑定项目', exact: true });
    await expect(binding).toBeVisible();
    await expect(binding).toBeEnabled();
    await expectPrimaryAction(binding);
    await expect(panel.locator('.brand-point')).toHaveCSS('fill', 'rgb(0, 144, 255)');
    await expect(panel.locator('#connection-view')).toBeHidden();
    await panel.getByRole('button', { name: '打开设置', exact: true }).click();
    await expect(panel.locator('.site-access-settings')).toBeHidden();
    await expect(binding).toBeVisible();
    await panel.getByRole('button', { name: '关闭设置', exact: true }).click();
    await panel.getByRole('radio', { name: '浅色', exact: true }).click();
    await expect(binding).toBeVisible();
    await expectPrimaryAction(binding);
    await expect(panel.locator('.brand-point')).toHaveCSS('fill', 'rgb(0, 144, 255)');
    await expect(panel.locator('.project-binding')).toHaveCSS(
      'border-top-color',
      'rgba(0, 0, 0, 0)',
    );
    await panel.screenshot({ path: test.info().outputPath('local-binding-light.png') });
    await panel.getByRole('radio', { name: '深色', exact: true }).click();
    await expect(binding).toHaveCSS('background-color', 'rgb(112, 184, 255)');
    await expect(binding).toHaveCSS('color', 'rgb(13, 21, 32)');
    await expect(panel.locator('.fixed-composer')).toHaveCount(0);
    await panel.screenshot({ path: test.info().outputPath('local-project-binding.png') });
    await binding.click();
    await expect(panel.locator('html')).toHaveAttribute(
      'data-handoff',
      `pointdom://bind?origin=${encodeURIComponent(origin)}`,
    );
    await expect(panel.locator('html')).toHaveAttribute('data-handoff-target', '_self');
    expect(fixture.jobs()).toHaveLength(0);
    linked = true;
    await expect(panel.locator('.fixed-composer')).toBeVisible({ timeout: 10000 });
    await expect(panel.locator('.project-binding')).toHaveCount(0);
  } finally {
    await fixture.close();
  }
});

for (const platform of ['mac', 'win'] as const) {
  test(`native pairing preserves saved credentials on ${platform} browser UI`, async () => {
    const fixture = await nativeFixture('<!doctype html><h1>Pairing fixture</h1>');
    const { context } = fixture;
    try {
      const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
      const id = new URL(worker.url()).host;
      const panel = await context.newPage();
      await panel.addInitScript(
        (os) =>
          Object.defineProperty(chrome.runtime, 'getPlatformInfo', {
            value: async () => ({ os, arch: 'arm64', nacl_arch: 'arm' }),
          }),
        platform,
      );
      const url = `chrome-extension://${id}/panel.html?settings=1`;
      await panel.addInitScript(() => {
        Object.defineProperty(chrome.tabs, 'create', {
          value: async () => {
            throw new Error('Pairing must not open a browser tab');
          },
        });
        window.open = (url, target) => {
          document.documentElement.dataset.handoff = String(url);
          document.documentElement.dataset.handoffTarget = String(target);
          return window;
        };
      });
      await panel.goto(url);
      await expect(panel.locator('#token')).not.toBeVisible();
      await expect(panel.locator('#copy-local-install')).toHaveCount(0);
      await expect(panel.locator('.local-install-guide')).toContainText('PointDOM App');
      if (platform === 'mac') {
        const pages = context.pages().length;
        await panel.getByRole('button', { name: '自动连接', exact: true }).click();
        await expect(panel.locator('html')).toHaveAttribute('data-handoff-target', '_self');
        await expect(panel.locator('html')).toHaveAttribute(
          'data-handoff',
          /^pointdom:\/\/connect\?extensionId=[a-p]{32}&challenge=[a-f0-9]{64}$/,
        );
        expect(context.pages()).toHaveLength(pages);
        expect(panel.url()).toBe(url);
      }
      const challenge = await panel.evaluate(async () => {
        const { nonce } = await chrome.runtime.sendMessage({ type: 'POINTDOM_CONNECTION_NONCE' });
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce));
        return Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join('');
      });
      await fixture.local('/bootstrap', { extensionId: id, challenge });
      await expect(panel.locator('#connection')).toHaveText('已连接', { timeout: 15000 });
      await panel.reload();
      await expect(panel.locator('#connection')).toHaveText('已连接');
      await expect(panel.locator('#copy-local-install')).toHaveCount(0);
      await panel.setViewportSize({ width: 280, height: 740 });
      expect(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(fixture.jobs()).toHaveLength(0);
    } finally {
      await fixture.close();
    }
  });
}
