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
  const injections: unknown[] = [];
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
        setPanelBehavior: async (options: { openPanelOnActionClick: boolean }) => {
          nativeToggle = options.openPanelOnActionClick;
        },
      },
      runtime: { onMessage: { addListener() {} } },
      tabs: {
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
        onClicked: { addListener() {} },
        setBadgeText: async (options: { tabId: number; text: string }) => {
          badges.push(options);
        },
        setTitle: async () => {},
      },
    },
  });
  await new Promise(setImmediate);
  assert.equal(nativeToggle, true);
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
