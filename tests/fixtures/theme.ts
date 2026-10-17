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
  const fill = light ? 'rgb(248, 248, 248)' : 'rgb(168, 255, 0)';
  const hover = light ? fill : 'rgb(152, 230, 0)';
  const pressed = light ? fill : 'rgb(136, 204, 0)';
  await page.mouse.move(0, 0);
  await expect(button).toHaveCSS('background-color', fill);
  await expect(button).toHaveCSS('color', 'rgb(21, 24, 27)');
  await button.hover();
  await expect(button).toHaveCSS('background-color', hover);
  await expect(button).toBeEnabled();
  await expect(button).toHaveCSS('--button-bg-pressed', light ? '#f8f8f8' : '#88cc00');
  await page.mouse.down();
  try {
    await expect(button).toHaveCSS('background-color', pressed);
    await expect(button).toHaveCSS('color', 'rgb(21, 24, 27)');
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
