import { extensionBrowserArgs } from './browser-args.js';
import { test, expect, chromium } from '@playwright/test';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../../src/bridge/store.js';
import { Queue } from '../../src/bridge/queue.js';
import { createApp } from '../../src/bridge/server.js';
import { agentContext } from '../../src/shared/agent-context.js';
import { readSelections } from '../../src/shared/contracts.js';

test('nested card children are picked independently with accurate DOM context', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pointdom-element-ui-'));
  const extension = join(directory, 'extension');
  cpSync(resolve('dist/extension'), extension, { recursive: true });
  const store = new Store(join(directory, 'state'));
  const app = new Hono();
  app.get('/fixture', (c) =>
    c.html(`<!doctype html><title>Nested card fixture</title>
    <style>body{font:16px system-ui;padding:24px}.card{display:block;width:320px;padding:16px;color:inherit;text-decoration:none}.media{height:140px;background:#ddd}.caption{display:flex;justify-content:space-between;padding:16px}svg{width:24px;height:24px}#privacy,#large{padding:12px}</style>
    <a id="product-card" class="card" href="/should-not-navigate"><div id="card-media" class="media"></div><div id="caption" class="caption"><span id="card-title" class="product-title">皮包光影</span><span id="card-action">做同款 <svg viewBox="0 0 24 24"><path d="M4 12H20M14 6L20 12L14 18" fill="none" stroke="currentColor" stroke-width="2"/></svg></span></div></a>
    <button id="no-events"><span id="passive-text" style="pointer-events:none">独立文字</span></button>
    <div id="shadow-host"></div>
    <div id="duplicates"><span id="duplicate">相同文字</span><span id="duplicate">相同文字</span></div>
    <section id="privacy" class="privacy" onclick="window.fixtureClicked=true" data-secret="PRIVATE-ATTRIBUTE"><span>安全上下文</span><input type="password" value="PRIVATE-VALUE"><textarea>PRIVATE-TEXTAREA</textarea><div contenteditable="true">PRIVATE-EDITABLE</div><div hidden>PRIVATE-HIDDEN</div><a href="/product?secret=PRIVATE-QUERY#PRIVATE-HASH">商品地址</a><img src="/photo?secret=PRIVATE-IMAGE-QUERY" alt="商品图"><script type="application/json">PRIVATE-SCRIPT</script></section>
    <section id="large"></section><div id="contents" style="display:contents"><span id="contents-text">分组文字</span></div>
    <script>
    const root = document.querySelector('#shadow-host').attachShadow({mode:'open'});
    const button = document.createElement('button');
    const text = document.createElement('span');text.id='shadow-text';text.textContent='Shadow 文字';button.append(text);root.append(button);
    const large = document.querySelector('#large');for(let i=0;i<80;i++){const span=document.createElement('span');span.textContent='内容'+i;large.append(span);}
    window.fixtureClicked=false;
    </script>`),
  );
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: app.fetch });
  if (!server.listening) await new Promise<void>((done) => server.once('listening', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  const origin = `http://127.0.0.1:${address.port}`;
  store.config.projects.push({
    id: randomUUID(),
    name: '元素测试',
    cwd: directory,
    origins: [origin],
  });
  const queue = new Queue(store);
  queue.agents.register({
    projectId: store.config.projects[0]!.id,
    claim: randomUUID(),
    client: { name: 'Selection fixture', version: '1' },
  });
  app.route('/', createApp(store, queue, address.port));
  for (const name of ['manifest.json', 'panel.js', 'background.js']) {
    const path = join(extension, name);
    writeFileSync(path, readFileSync(path, 'utf8').replaceAll('http://127.0.0.1:4318', origin));
  }
  const context = await chromium.launchPersistentContext(join(directory, 'profile'), {
    channel: 'chromium',
    headless: true,
    args: extensionBrowserArgs(extension),
  });
  try {
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const page = await context.newPage();
    await page.goto(`${origin}/fixture`);
    const panel = await context.newPage();
    await panel.setViewportSize({ width: 390, height: 850 });
    panel.setDefaultTimeout(5000);
    await panel.goto(`chrome-extension://${new URL(worker.url()).host}/panel.html`);
    await panel.getByRole('button', { name: '高级：手动配对', exact: true }).click();
    await panel.locator('#token').fill(store.config.token);
    await panel.locator('#connect').click();
    await page.bringToFront();
    await panel.locator('#execution-settings').click();
    await panel
      .getByRole('dialog', { name: '接收客户端', exact: true })
      .getByRole('button', { name: '使用 Selection fixture', exact: true })
      .click();
    await panel.locator('#pick').click();
    await page.locator('#card-title').click();
    await expect(panel.locator('#selected strong')).toHaveText(['皮包光影']);
    const selections = async () =>
      readSelections(
        await panel.evaluate(async () => {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          return (await chrome.storage.local.get(`selection:${tab!.id}`))[`selection:${tab!.id}`];
        }),
      );
    expect((await selections())[0]!.selector).toBe('#card-title');
    expect((await selections())[0]!.tag).toBe('span');
    await page.locator('#card-action').click({ position: { x: 10, y: 10 } });
    await expect.poll(async () => (await selections()).length).toBe(2);
    expect((await selections())[1]!.selector).toBe('#card-action');
    await page.locator('svg').click({ position: { x: 12, y: 12 } });
    await expect.poll(async () => (await selections()).length).toBe(3);
    expect((await selections())[2]!.tag).toBe('path');
    // Hierarchy selection uses the highlighted parent, even when the cursor remains over a child.
    await page.locator('#card-title').hover();
    await page.keyboard.press('Alt+ArrowUp');
    const titleBox = await page.locator('#card-title').boundingBox();
    await page.mouse.click(titleBox!.x + titleBox!.width / 2, titleBox!.y + titleBox!.height / 2);
    await expect.poll(async () => (await selections()).length).toBe(4);
    expect((await selections())[3]!.selector).toBe('#caption');
    await page.keyboard.press('Alt+ArrowDown');
    await page.mouse.click(titleBox!.x + titleBox!.width / 2, titleBox!.y + titleBox!.height / 2);
    expect((await selections()).length).toBe(4);
    const passiveBox = await page.locator('#passive-text').boundingBox();
    await page.mouse.move(
      passiveBox!.x + passiveBox!.width / 2,
      passiveBox!.y + passiveBox!.height / 2,
    );
    await page.keyboard.press('Alt+ArrowDown');
    await page.mouse.click(
      passiveBox!.x + passiveBox!.width / 2,
      passiveBox!.y + passiveBox!.height / 2,
    );
    await expect.poll(async () => (await selections()).length).toBe(5);
    expect((await selections())[4]!.selector).toBe('#passive-text');
    await page.locator('#shadow-host #shadow-text').click();
    await expect.poll(async () => (await selections()).length).toBe(6);
    const shadowSelection = (await selections())[5]!;
    expect(shadowSelection.tag).toBe('span');
    expect(shadowSelection.selectorPath).toEqual(['#shadow-host', '#shadow-text']);
    await page.locator('#duplicates span').nth(0).click();
    await page.locator('#duplicates span').nth(1).click();
    await expect.poll(async () => (await selections()).length).toBe(8);
    const selected = await selections();
    expect(selected[6]!.selector).toBe('#duplicates > span:nth-of-type(1)');
    expect(selected[7]!.selector).toBe('#duplicates > span:nth-of-type(2)');
    for (const item of selected.filter((item) => !item.selectorPath)) {
      expect(await page.locator(item.selector).count()).toBe(1);
    }
    expect(selected[0]!.dom!.html).toContain(
      '<span id="card-title" class="product-title">皮包光影</span>',
    );
    expect(selected[0]!.dom!.ancestors[0]!.attributes.id).toBe('caption');
    expect(selected[0]!.dom!.siblings[0]!.label).toBe('做同款');
    expect(selected[1]!.dom!.siblings[0]!.label).toBe('皮包光影');
    expect(page.url()).toBe(`${origin}/fixture`);
    await panel.getByLabel('皮包光影的修改描述').fill('仅修改左侧标题');
    await panel.getByLabel('做同款的修改描述', { exact: true }).fill('仅修改右侧文字');
    await panel.locator('#instruction').fill('按各元素描述修改，不扩大到整张卡片');
    await panel.locator('#pick').click();
    await panel.getByRole('button', { name: '定位 Shadow 文字', exact: true }).click();
    await expect(panel.locator('#notice')).toContainText('已定位');
    await expect(page.locator('[data-pointdom-locator]')).toHaveCount(1);
    await panel.getByRole('button', { name: '查看 皮包光影 的元素与样式', exact: true }).click();
    const details = panel.getByRole('dialog', { name: '皮包光影 · 元素与样式', exact: true });
    await details.getByRole('button', { name: 'DOM 结构', exact: true }).click();
    await expect(details.locator('.element-dom pre')).toContainText('product-title');
    await panel.screenshot({
      path: test.info().outputPath('pointdom-precise-dom-details.png'),
      animations: 'disabled',
    });
    await details.press('Escape');
    await panel.locator('#submit').click();
    await expect.poll(() => store.jobs.length).toBe(1);
    const job = store.jobs[0]!;
    expect(job.selections).toHaveLength(8);
    expect(job.selections![0]!.dom).toEqual(selected[0]!.dom);
    expect(agentContext(job).untrustedPageContext[0]!.dom!.html).toContain('card-title');
    expect(JSON.stringify(agentContext(job))).toContain('sanitized DOM excerpt');
    expect(JSON.stringify(agentContext(job))).toContain('仅修改左侧标题');
    expect(new Store(store.directory).jobs[0]!.selections![5]!.selectorPath).toEqual(
      shadowSelection.selectorPath,
    );
    await panel.locator('#pick').click();
    await page.locator('#privacy').click({ position: { x: 2, y: 2 } });
    await expect.poll(async () => (await selections()).length).toBe(1);
    const privateSelection = (await selections())[0]!;
    expect(privateSelection.selector).toBe('#privacy');
    expect(JSON.stringify(privateSelection)).not.toContain('PRIVATE-');
    expect(privateSelection.dom!.html).toContain('安全上下文');
    expect(privateSelection.dom!.html).not.toContain('onclick');
    expect(privateSelection.dom!.html).not.toContain('data-secret');
    expect(
      await page.evaluate(
        () => (window as typeof window & { fixtureClicked: boolean }).fixtureClicked,
      ),
    ).toBe(false);
    await page.locator('#large').click({ position: { x: 2, y: 2 } });
    await expect.poll(async () => (await selections()).length).toBe(2);
    const largeSelection = (await selections())[1]!;
    expect(largeSelection.dom!.truncated).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(largeSelection.dom)).length).toBeLessThan(10000);
    await page.locator('#contents-text').hover();
    await page.keyboard.press('Alt+ArrowUp');
    const contentsBox = await page.locator('#contents-text').boundingBox();
    await page.mouse.click(
      contentsBox!.x + contentsBox!.width / 2,
      contentsBox!.y + contentsBox!.height / 2,
    );
    await expect.poll(async () => (await selections()).length).toBe(3);
    const contentsSelection = (await selections())[2]!;
    expect(contentsSelection.selector).toBe('#contents');
    expect(contentsSelection.rect.width).toBeGreaterThan(0);
    await panel.locator('#pick').click();
    await panel.getByRole('button', { name: '定位 分组文字', exact: true }).click();
    await expect(panel.locator('#notice')).toContainText('已定位');
  } finally {
    await context.close();
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
    rmSync(directory, { recursive: true, force: true });
  }
});
