import { expect, type Locator } from '@playwright/test';

export async function expectPrimaryAction(button: Locator) {
  const page = button.page();
  const light = await page
    .locator('html')
    .evaluate(
      (element) =>
        element.getAttribute('data-mode') === 'light' ||
        element.getAttribute('data-theme') === 'light',
    );
  const fill = light ? 'rgb(238, 238, 238)' : 'rgb(207, 246, 146)';
  const ink = light ? 'rgb(184, 184, 184)' : 'rgb(21, 24, 27)';
  await page.mouse.move(0, 0);
  await expect(button).toHaveCSS('background-color', fill);
  await expect(button).toHaveCSS('color', ink);
  await button.hover();
  await expect(button).toHaveCSS('background-color', fill);
  await expect(button).toHaveCSS('color', light ? 'rgb(40, 43, 48)' : ink);
  await expect(button).toBeEnabled();
  await expect(button).toHaveCSS('--button-bg-pressed', light ? '#eeeeee' : '#cff692');
  await page.mouse.down();
  try {
    await expect(button).toHaveCSS('background-color', fill);
    await expect(button).toHaveCSS('color', light ? 'rgb(40, 43, 48)' : ink);
  } finally {
    // Release outside even after a failed assertion; never submit a fixture action.
    await page.mouse.move(0, 0);
    await page.mouse.up();
  }
  await expect(button).toHaveCSS('background-color', fill);
}

/** Verify each appearance's explicit resting and hover surfaces. */
export async function expectTabSurface(
  tab: Locator,
  background: string,
  hoverBackground = background,
) {
  await tab.page().mouse.move(0, 0);
  if (
    background === 'rgba(0, 0, 0, 0)' &&
    hoverBackground === background &&
    (await tab.evaluate((element) => element.classList.contains('button')))
  ) {
    // Check tokens even when the host does not expose the hover media feature.
    await expect(tab).toHaveCSS('--button-bg-hover', 'transparent');
    await expect(tab).toHaveCSS('--button-bg-pressed', 'transparent');
  }
  await expect(tab).toHaveCSS('background-color', background);
  await tab.hover();
  await expect(tab).toHaveCSS('background-color', hoverBackground);
  await tab.page().mouse.move(0, 0);
}
