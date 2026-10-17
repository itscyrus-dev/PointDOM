import { test, expect } from '@playwright/test';
import { nativeFixture } from '../fixtures/native.js';

test('element names, grouped snapshots and exact locating preserve drafts and reject changed targets', async () => {
  const fixture =
    await nativeFixture(`<!doctype html><title>Element fixture</title><style>body{font:16px system-ui;padding:24px}button,input,section{margin:12px;padding:12px}button{color:rgb(20,20,20);background:rgb(240,240,240);border:0;border-radius:8px}#spacer{height:1000px}</style>
  <span id="action-name">保存 修改</span><button id="action" aria-labelledby="action-name" aria-label="Wrong fallback">Icon</button>
  <label for="field">项目名称</label><input id="field" value="DO-NOT-CAPTURE-INPUT">
  <section id="container"><h2>  商品\n 展示 </h2><p>Extra container content</p><div contenteditable="true">DO-NOT-CAPTURE-EDITABLE</div></section>
  <button id="icon" title="设置">⚙</button><div id="spacer"></div><button id="bottom">底部按钮</button>`);
  const { context, origin } = fixture;
  try {
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const page = await context.newPage();
    await page.goto(`${origin}/fixture`);
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 390, height: 850 });
    panel.setDefaultTimeout(5000);
    await panel.goto(`chrome-extension://${new URL(worker.url()).host}/panel.html`);
    await panel.getByRole('button', { name: '高级：手动配对', exact: true }).click();
    await panel.locator('#token').fill(fixture.token);
    await panel.locator('#connect').click();
    await page.bringToFront();
    await panel.locator('#pick').click();
    await page.locator('#action').click();
    await page.locator('#field').click();
    await page.locator('#container').click({ position: { x: 2, y: 2 } });
    await page.locator('#icon').click();
    await expect(panel.locator('#selected strong')).toHaveText([
      '保存 修改',
      '项目名称',
      '商品 展示',
      '设置',
    ]);
    await expect(panel.locator('.selection-number')).toHaveText(['1', '2', '3', '4']);
    await expect(panel.locator('.selection-type')).toHaveText(['按钮', '表单', '容器', '按钮']);
    const selections = await panel.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      return (await chrome.storage.local.get(`selection:${tab!.id}`))[`selection:${tab!.id}`];
    });
    expect(JSON.stringify(selections)).not.toContain('DO-NOT-CAPTURE');
    await panel.getByLabel('保存 修改的修改描述').fill('保留这份描述');
    await panel.locator('#instruction').fill('保留整体草稿');
    await panel.getByRole('button', { name: '查看 保存 修改 的元素与样式', exact: true }).click();
    const details = panel.getByRole('dialog', { name: '保存 修改 · 元素与样式', exact: true });
    await expect(details).toBeVisible();
    await expect(details.getByRole('heading', { name: '布局', exact: true })).toBeVisible();
    await expect(details.locator('.element-details-body')).not.toContainText('box-shadow');
    await details.getByRole('button', { name: '显示全部', exact: true }).click();
    await expect(details.locator('.element-details-body')).toContainText('box-shadow');
    await details.getByRole('button', { name: '复制选择器', exact: true }).click();
    await expect(details.getByRole('button', { name: '复制选择器', exact: true })).toHaveText(
      '已复制',
    );
    await panel.screenshot({ path: test.info().outputPath('pointdom-element-grouped-dark.png') });
    await details.press('Escape');
    await panel.locator('#pick').click();
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await panel.getByRole('button', { name: '定位 保存 修改', exact: true }).click();
    await expect(page.locator('[data-pointdom-locator]')).toHaveCount(1);
    await expect(panel.locator('#notice')).toContainText('已定位');
    await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(200);
    await expect(page.locator('[data-pointdom-locator]')).toHaveCount(0);
    await page
      .locator('#action')
      .evaluate((element) => element.setAttribute('aria-label', 'Still not the name'));
    await page.locator('#action-name').evaluate((element) => {
      element.textContent = 'Changed name';
    });
    await panel.getByRole('button', { name: '定位 保存 修改', exact: true }).click();
    await expect(panel.locator('#notice')).toContainText('元素已变化');
    await expect(page.locator('[data-pointdom-locator]')).toHaveCount(0);
    await expect(panel.getByLabel('保存 修改的修改描述')).toHaveValue('保留这份描述');
    await expect(panel.locator('#instruction')).toHaveValue('保留整体草稿');
    await page.locator('#action-name').evaluate((element) => {
      element.textContent = '保存 修改';
    });
    await page.locator('#action').evaluate((element) => element.after(element.cloneNode(true)));
    await panel.getByRole('button', { name: '定位 保存 修改', exact: true }).click();
    await expect(panel.locator('#notice')).toContainText('元素已变化');
    await expect(page.locator('[data-pointdom-locator]')).toHaveCount(0);
    await panel.getByRole('radio', { name: '浅色', exact: true }).click();
    await panel.getByRole('button', { name: '查看 保存 修改 的元素与样式', exact: true }).click();
    await expect(details).toBeVisible();
    await expect(panel.locator('html')).toHaveAttribute('data-mode', 'light');
    await panel.screenshot({
      path: test.info().outputPath('pointdom-element-grouped-light.png'),
      animations: 'disabled',
    });
    await details.press('Escape');
    await panel.setViewportSize({ width: 280, height: 850 });
    await panel.getByRole('button', { name: '查看 保存 修改 的元素与样式', exact: true }).click();
    await expect(details).toBeVisible();
    await expect
      .poll(() => panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await panel.screenshot({
      path: test.info().outputPath('pointdom-element-grouped-narrow.png'),
      animations: 'disabled',
    });
    await details.press('Escape');
    await page.goto(`${origin}/fixture?query=allowed`);
    await page.locator('#action').evaluate((element) => element.remove());
    await panel.getByRole('button', { name: '定位 保存 修改', exact: true }).click();
    await expect(panel.locator('#notice')).toContainText('元素已变化');
  } finally {
    await fixture.close();
  }
});
