import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { extensionDirectory, openExtensionSetup } from '../src/bridge/extension-setup.js';

test('extension setup resolves files beside the installed CLI, including spaces and non-ASCII paths', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pointdom-extension-')));
  try {
    const dist = join(root, '版本 with spaces', 'dist');
    mkdirSync(join(dist, 'bridge'), { recursive: true });
    mkdirSync(join(dist, 'extension'));
    const entry = pathToFileURL(join(dist, 'bridge/main.js')).href;
    assert.throws(() => extensionDirectory(entry), /Extension files not found/);
    writeFileSync(join(dist, 'extension/manifest.json'), '{}');
    assert.equal(extensionDirectory(entry), join(dist, 'extension'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('extension setup falls back independently when clipboard, Finder or Chrome are unavailable', () => {
  const path = '/test/with spaces/扩展';
  const calls: { command: string; args: string[]; input?: string }[] = [];
  const result = openExtensionSetup(path, 'darwin', (command, args, input) => {
    calls.push({ command, args, input });
    if (args.includes('Google Chrome')) throw new Error('Chrome not installed');
  });
  assert.deepEqual(result, { pathCopied: true, folderOpened: true, chromeOpened: false });
  assert.deepEqual(calls[0], { command: '/usr/bin/pbcopy', args: [], input: path });
  assert.deepEqual(calls[1]?.args, [path]);
  assert.deepEqual(
    openExtensionSetup(path, 'darwin', () => {
      throw new Error('unavailable');
    }),
    { pathCopied: false, folderOpened: false, chromeOpened: false },
  );
  assert.deepEqual(
    openExtensionSetup(path, 'linux', () => {
      assert.fail('must not launch macOS commands');
    }),
    { pathCopied: false, folderOpened: false, chromeOpened: false },
  );
});
