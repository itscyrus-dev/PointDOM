import { expect, type Locator } from '@playwright/test';

export async function expectLimeAction(button: Locator) {
  const page = button.page();
  await page.mouse.move(0, 0);
  await expect(button).toHaveCSS('background-color', 'rgb(168, 255, 0)');
  await expect(button).toHaveCSS('color', 'rgb(21, 24, 27)');
  await button.hover();
  await expect(button).toHaveCSS('background-color', 'rgb(152, 230, 0)');
  await page.mouse.down();
  try {
    await expect(button).toHaveCSS('background-color', 'rgb(136, 204, 0)');
    await expect(button).toHaveCSS('color', 'rgb(21, 24, 27)');
    // Release outside the button so checking pressed state never submits an action.
    await page.mouse.move(0, 0);
  } finally {
    await page.mouse.up();
  }
  await expect(button).toHaveCSS('background-color', 'rgb(168, 255, 0)');
}

/** A tab's surface conveys selection, never the pointer passing over it. */
export async function expectTabSurface(tab: Locator, background: string) {
  await tab.page().mouse.move(0, 0);
  if (
    background === 'rgba(0, 0, 0, 0)' &&
    (await tab.evaluate((element) => element.classList.contains('button')))
  ) {
    // Check tokens even when the host does not expose the hover media feature.
    await expect(tab).toHaveCSS('--button-bg-hover', 'transparent');
    await expect(tab).toHaveCSS('--button-bg-pressed', 'transparent');
  }
  await expect(tab).toHaveCSS('background-color', background);
  await tab.hover();
  await expect(tab).toHaveCSS('background-color', background);
  await tab.page().mouse.move(0, 0);
}
