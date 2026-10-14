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
  let command: (name: string, tab?: { id: number }) => void = () => {};
  const injections: unknown[] = [];
  const badges: { tabId: number; text: string }[] = [];
  let restricted = false;
  let nativeToggle = false;
  runInNewContext(output.outputFiles[0]!.text, {
    chrome: {
      storage: { local: { setAccessLevel: async () => {} } },
      sidePanel: {
        setPanelBehavior: async (options: { openPanelOnActionClick: boolean }) => {
          nativeToggle = options.openPanelOnActionClick;
        },
      },
      runtime: { onMessage: { addListener() {} } },
      tabs: { onRemoved: { addListener() {} } },
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
        setBadgeText: async (options: { tabId: number; text: string }) => {
          badges.push(options);
        },
        setTitle: async () => {},
      },
    },
  });
  assert.equal(nativeToggle, true);
  command('_execute_action', { id: 7 });
  command('pick-element');
  assert.equal(injections.length, 0);
  command('pick-element', { id: 7 });
  await new Promise(setImmediate);
  assert.deepEqual(JSON.parse(JSON.stringify(injections)), [
    { target: { tabId: 7 }, files: ['content.js'] },
  ]);
  assert.equal(badges.at(-1)?.text, '');
  restricted = true;
  command('pick-element', { id: 9 });
  await new Promise(setImmediate);
  assert.equal(badges.at(-1)?.text, '!');
  assert.equal(badges.at(-1)?.tabId, 9);
});
