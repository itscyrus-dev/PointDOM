import { test, expect, chromium } from '@playwright/test';
import { serve } from '@hono/node-server';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createApp } from '../../src/bridge/server.js';
import { Store } from '../../src/bridge/store.js';
import { Queue } from '../../src/bridge/queue.js';
import { extensionBrowserArgs } from './browser-args.js';

for (const platform of ['mac', 'win'] as const) {
  test(`extension detects ${platform} from browser, auto-connects after local authorization and preserves pairing on reopen`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pointdom-local-install-'));
    const extension = join(directory, 'extension');
    cpSync(resolve('dist/extension'), extension, { recursive: true });
    const store = new Store(join(directory, 'state'));
    let app: ReturnType<typeof createApp>;
    let available = false;
    const server = serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: (req) => (available ? app.fetch(req) : new Response('offline', { status: 503 })),
    });
    if (!server.listening) await new Promise<void>((done) => server.once('listening', done));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No fixture port');
    const origin = `http://127.0.0.1:${address.port}`;
    app = createApp(store, new Queue(store), address.port);
    for (const name of ['manifest.json', 'panel.js', 'background.js']) {
      const file = join(extension, name);
      writeFileSync(file, readFileSync(file, 'utf8').replaceAll('http://127.0.0.1:4318', origin));
    }
    const context = await chromium.launchPersistentContext(join(directory, 'profile'), {
      channel: 'chromium',
      headless: true,
      args: extensionBrowserArgs(extension),
    });
    try {
      const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
      const id = new URL(worker.url()).host;
      const panel = await context.newPage();
      await panel.addInitScript((os) => {
        Object.defineProperty(chrome.runtime, 'getPlatformInfo', {
          value: async () => ({ os, arch: 'arm64', nacl_arch: 'arm' }),
        });
      }, platform);
      await panel.setViewportSize({ width: 390, height: 820 });
      const writes: string[] = [];
      await panel.exposeFunction('writeInstallClipboard', (text: string) => {
        writes.push(text);
      });
      const url = `chrome-extension://${id}/panel.html?settings=1`;
      await panel.goto(url);
      await panel.evaluate(() => {
        navigator.clipboard.writeText = async (text: string) => {
          await (
            window as unknown as { writeInstallClipboard: (text: string) => Promise<void> }
          ).writeInstallClipboard(text);
        };
      });
      await expect(panel.locator('#local-service-status')).toHaveText('本地服务未连接。');
      await expect(panel.locator('#token')).not.toBeVisible();
      await expect(panel.locator('#install-platform')).toHaveCount(0);
      await expect(panel.getByRole('combobox')).toHaveCount(0);
      await expect(panel.locator('.local-install-guide')).toContainText(
        platform === 'mac' ? '在终端粘贴并运行' : '在 PowerShell 粘贴并运行',
      );
      await panel.locator('#copy-local-install').click();
      await expect(panel.locator('#local-service-status')).toContainText('等待安装完成');
      expect(writes).toHaveLength(1);
      expect(writes[0]).toContain(
        platform === 'mac' ? 'install.sh | sh -s -- --extension-id ' + id : 'install.ps1',
      );
      expect(writes[0]).not.toContain(platform === 'mac' ? 'install.ps1' : 'install.sh');
      expect(writes[0]).not.toContain(store.config.token);
      const challenge = (
        platform === 'mac' ? /--challenge ([a-f0-9]{64})/ : /-Challenge ([a-f0-9]{64})/
      ).exec(writes[0]!)?.[1];
      expect(challenge).toBeTruthy();
      await expect(panel.locator('#copy-local-install')).toBeEnabled();
      await expect(panel.getByRole('listbox')).toHaveCount(0);
      await panel.screenshot({
        path: test.info().outputPath('local-install-dark.png'),
        animations: 'disabled',
      });
      available = true;
      await panel.reload();
      await expect(panel.locator('#local-service-status')).toContainText('已检测到本地服务');
      // Completing installation authorizes only this pending browser challenge; no task/project changes.
      const response = await fetch(`${origin}/api/local/bootstrap`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${store.config.token}`,
          'X-PagePatch-Local': '1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ extensionId: id, challenge }),
      });
      expect(response.status).toBe(200);
      await expect(panel.locator('#connection')).toHaveText('已连接', { timeout: 15000 });
      await expect(panel.locator('#copy-agent-setup')).toBeVisible();
      expect(store.config.projects).toHaveLength(0);
      expect(store.jobs).toHaveLength(0);
      await panel.reload();
      await expect(panel.locator('#connection')).toHaveText('已连接');
      await expect(panel.locator('#copy-local-install')).toHaveCount(0);
      await panel.getByRole('radio', { name: '浅色', exact: true }).click();
      await panel.setViewportSize({ width: 280, height: 740 });
      await expect
        .poll(() => panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
        .toBe(true);
      await panel.screenshot({ path: test.info().outputPath('local-install-connected-light.png') });
    } finally {
      await context.close();
      const closed = new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
      if ('closeAllConnections' in server) server.closeAllConnections();
      await closed;
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
