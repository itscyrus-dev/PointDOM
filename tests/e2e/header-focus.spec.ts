import { extensionBrowserArgs } from './browser-args.js';
import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

test('header pointer interactions never stack focus rings; keyboard focus stays visible', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'pointdom-header-focus-'));
  const extension = resolve('dist/extension');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: extensionBrowserArgs(extension),
  });
  try {
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 390, height: 640 });
    await panel.goto(`chrome-extension://${new URL(worker.url()).host}/panel.html?settings=1`);
    const language = panel.locator('#language-toggle');
    for (const mode of ['浅色', '深色']) {
      await panel.getByRole('radio', { name: mode, exact: true }).click();
      // Closing a keyboard-navigated menu restores focus to the real HeroUI trigger.
      await language.click();
      await panel.getByRole('menu').press('Escape');
      await expect(panel.getByRole('menu')).toBeHidden();
      await expect(language).toBeFocused();
      await language.hover();
      await panel.locator('.app-header').screenshot({
        path: test.info().outputPath(`header-restored-${mode}.png`),
        animations: 'disabled',
      });
      await expect(language).toHaveCSS('box-shadow', 'none');
      await expect(language).toHaveCSS('outline-width', '1px');
      await expect(language).toHaveCSS('outline-offset', '2px');
      await language.click();
      await panel.getByRole('menuitemradio', { name: '简体中文', exact: true }).click();
      await expect(panel.getByRole('menu')).toBeHidden();
      await expect(language).toHaveCSS('outline-style', 'none');
      await expect(language).toHaveCSS('box-shadow', 'none');
      await language.hover();
      await panel.locator('.app-header').screenshot({
        path: test.info().outputPath(`header-pointer-${mode}.png`),
        animations: 'disabled',
      });
      // A real Tab transition, rather than programmatic focus, must show one thin ring.
      await panel.keyboard.press('Tab');
      await panel.keyboard.press('Shift+Tab');
      await expect(language).toBeFocused();
      await expect(language).toHaveCSS('outline-width', '1px');
      await expect(language).toHaveCSS('outline-style', 'solid');
      await expect(language).toHaveCSS('box-shadow', 'none');
      await panel.keyboard.press('Shift+Tab');
      const selectedMode = panel.locator('#theme-mode').getByRole('radio', { checked: true });
      // HeroUI restores the group's last focused item, which need not be selected.
      const focusedMode = panel.locator('#theme-mode [role="radio"]:focus');
      await expect(focusedMode).toHaveCount(1);
      await expect(focusedMode).toHaveCSS('outline-width', '1px');
      await expect(focusedMode).toHaveCSS('outline-style', 'solid');
      await expect(focusedMode).toHaveCSS('box-shadow', 'none');
      await expect(selectedMode).toHaveAttribute('aria-label', mode);
      await selectedMode.click();
      await expect(selectedMode).toHaveCSS('outline-style', 'none');
      await expect(selectedMode).toHaveCSS('box-shadow', 'none');
    }
  } finally {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  }
});
