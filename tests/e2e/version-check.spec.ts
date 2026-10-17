import { extensionBrowserArgs } from './browser-args.js';
import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { latestReleaseUrl } from '../../src/extension/release-check.js';

test('settings version checks work without pairing and handle pending, updates, errors, retries and both languages', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'pointdom-version-ui-'));
  const extension = resolve('dist/extension');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: extensionBrowserArgs(extension),
  });
  const current: string = JSON.parse(
    readFileSync(resolve('dist/extension/manifest.json'), 'utf8'),
  ).version;
  const newer = current
    .split('.')
    .map((part, index) => (index === 2 ? Number(part) + 1 : Number(part)))
    .join('.');
  let status = 200,
    latest = `v${current}`,
    requests = 0,
    hold = false;
  let release: (() => void) | undefined;
  await context.route(latestReleaseUrl, async (route) => {
    requests++;
    expect(route.request().headers().authorization).toBeUndefined();
    expect(route.request().postData()).toBeNull();
    if (hold)
      await new Promise<void>((done) => {
        release = done;
      });
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ tag_name: latest, draft: false, prerelease: false }),
    });
  });
  try {
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 390, height: 820 });
    await panel.goto(`chrome-extension://${new URL(worker.url()).host}/panel.html?settings=1`);
    const check = panel.locator('#version-check');
    await expect(panel.locator('.version-number')).toHaveText(`v${current}`);
    expect(requests).toBe(0);
    hold = true;
    await check.click();
    await expect(check).toBeDisabled();
    await expect(check).toContainText('检查中');
    await expect.poll(() => Boolean(release)).toBe(true);
    expect(requests).toBe(1);
    hold = false;
    release!();
    await expect(check).toContainText('已是最新');
    latest = `v${newer}`;
    await check.click();
    await expect(check).toContainText(`发现 v${newer}`);
    await expect(panel.locator('.settings-version')).toContainText('原生客户端');
    await check.hover();
    await panel
      .locator('.settings-version')
      .screenshot({ path: test.info().outputPath('pointdom-version-update-dark.png') });
    status = 403;
    await check.click();
    await expect(check).toContainText('检查失败');
    await expect(panel.locator('.version-number')).toHaveText(`v${current}`);
    status = 200;
    latest = 'v0.1.0';
    await check.click();
    await expect(check).toContainText('当前版本较新');
    await panel.locator('#language-toggle').click();
    await panel.getByRole('menuitemradio', { name: 'English', exact: true }).click();
    latest = `v${current}`;
    await check.click();
    await expect(check).toContainText('Up to date');
    await panel.getByRole('radio', { name: 'Light', exact: true }).click();
    await panel.setViewportSize({ width: 280, height: 700 });
    await check.scrollIntoViewIfNeeded();
    await check.hover();
    await panel.screenshot({ path: test.info().outputPath('pointdom-version-light-narrow.png') });
    expect(await panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    release?.();
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  }
});
