import { extensionBrowserArgs } from './browser-args.js';
import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync, mkdirSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { extensionSetupDirectory } from '../../src/bridge/extension-setup.js';

test('a fixed extension path reloads the next release without changing its ID or browser storage', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pointdom-extension-upgrade-'));
  const release = (name: string, version: string) => {
    const root = join(directory, 'versions', name, 'dist');
    mkdirSync(join(root, 'bridge'), { recursive: true });
    cpSync(resolve('dist/extension'), join(root, 'extension'), { recursive: true });
    const path = join(root, 'extension/manifest.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    manifest.version = version;
    writeFileSync(path, JSON.stringify(manifest));
    return pathToFileURL(join(root, 'bridge/main.js')).href;
  };
  const first = release('first', '0.2.1');
  const second = release('second', '0.2.2');
  const extension = extensionSetupDirectory(first, true);
  const context = await chromium.launchPersistentContext(join(directory, 'profile'), {
    channel: 'chromium',
    headless: true,
    args: extensionBrowserArgs(extension),
  });
  try {
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).host;
    expect(await worker.evaluate(() => chrome.runtime.getManifest().version)).toBe('0.2.1');
    await worker.evaluate(() => chrome.storage.local.set({ upgradeFixture: 'preserve me' }));
    expect(extensionSetupDirectory(second, true)).toBe(extension);
    const manager = await context.newPage();
    await manager.goto('chrome://extensions');
    await manager.locator('extensions-toolbar').locator('#devMode').click();
    const closed = worker.waitForEvent('close', { timeout: 10000 });
    await worker.evaluate(() => {
      setTimeout(() => chrome.runtime.reload(), 0);
    });
    await closed;
    const updated = await context.newPage();
    await expect(async () => {
      await updated.goto(`chrome-extension://${id}/panel.html?settings=1`);
      expect(new URL(updated.url()).host).toBe(id);
      expect(await updated.evaluate(() => chrome.runtime.getManifest().version)).toBe('0.2.2');
    }).toPass({ timeout: 10000 });
    expect(
      await updated.evaluate(
        async () => (await chrome.storage.local.get('upgradeFixture')).upgradeFixture,
      ),
    ).toBe('preserve me');
  } finally {
    await context.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
