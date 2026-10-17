import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

test('shortcuts register native panel toggle and inject picker only into commanded tab', async () => {
  const manifest = JSON.parse(readFileSync('src/extension/manifest.json', 'utf8'));
  assert.equal(manifest.commands['_execute_action'].suggested_key.default, 'Alt+Shift+P');
  assert.equal(manifest.commands['pick-element'].suggested_key.default, 'Alt+Shift+A');
  const output = await build({
    entryPoints: ['src/extension/background.ts'],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
  });
  let command: (name: string, tab?: { id: number; url?: string }) => void = () => {};
  let click: (tab: { id: number; url?: string }) => void = () => {};
  const opened: string[] = [];
  const injections: unknown[] = [];
  const panels: number[] = [];
  const badges: { tabId: number; text: string }[] = [];
  let restricted = false;
  let nativeToggle = false;
  runInNewContext(output.outputFiles[0]!.text, {
    URL,
    AbortSignal,
    fetch: async () => Response.json({ projects: [{ origins: ['http://localhost:5173'] }] }),
    chrome: {
      storage: {
        local: {
          setAccessLevel: async () => {},
          get: async () => ({
            bridgeToken: 'fixture-token',
            pointdomLinkedOrigins: ['http://localhost:5173'],
          }),
          set: async () => {},
        },
        onChanged: { addListener() {} },
      },
      sidePanel: {
        setOptions: async () => {},
        getOptions: async () => ({ enabled: false }),
        open: async ({ tabId }: { tabId: number }) => panels.push(tabId),
        setPanelBehavior: async (options: { openPanelOnActionClick: boolean }) => {
          nativeToggle = options.openPanelOnActionClick;
        },
      },
      runtime: {
        onMessage: { addListener() {} },
        getURL: (path: string) => `chrome-extension://fixture/${path}`,
      },
      tabs: {
        create: async ({ url }: { url: string }) => opened.push(url),
        sendMessage: async () => {},
        query: async () => [],
        onRemoved: { addListener() {} },
        onUpdated: { addListener() {} },
        onActivated: { addListener() {} },
      },
      permissions: { onRemoved: { addListener() {} } },
      commands: {
        onCommand: {
          addListener(listener: typeof command) {
            command = listener;
          },
        },
      },
      scripting: {
        executeScript: async (options: unknown) => {
          if (restricted) throw new Error('restricted');
          injections.push(options);
        },
      },
      action: {
        onClicked: {
          addListener(listener: typeof click) {
            click = listener;
          },
        },
        setBadgeText: async (options: { tabId: number; text: string }) => {
          badges.push(options);
        },
        setTitle: async () => {},
      },
    },
  });
  await new Promise(setImmediate);
  assert.equal(nativeToggle, true);
  click({ id: 12, url: 'https://unlinked.example/private?token=secret' });
  await new Promise(setImmediate);
  assert.deepEqual(opened, []);
  assert.deepEqual(panels, []);
  click({ id: 13, url: 'http://127.0.0.1:5174/editor?private=value' });
  await new Promise(setImmediate);
  assert.deepEqual(panels, [13]);
  assert.deepEqual(opened, []);
  assert.equal(injections.length, 0);
  command('_execute_action', { id: 7 });
  command('pick-element');
  assert.equal(injections.length, 0);
  command('pick-element', { id: 7, url: 'https://unrelated.example' });
  await new Promise(setImmediate);
  assert.equal(injections.length, 0);
  command('pick-element', { id: 7, url: 'http://localhost:5173/editor' });
  await new Promise(setImmediate);
  assert.deepEqual(JSON.parse(JSON.stringify(injections)), [
    { target: { tabId: 7 }, files: ['content.js'] },
  ]);
  assert.equal(badges.at(-1)?.text, '');
  restricted = true;
  command('pick-element', { id: 9, url: 'http://localhost:5173/editor' });
  await new Promise(setImmediate);
  assert.equal(badges.at(-1)?.text, '!');
  assert.equal(badges.at(-1)?.tabId, 9);
});
