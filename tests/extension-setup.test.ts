import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  realpathSync,
  lstatSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import {
  extensionDirectory,
  extensionArchive,
  extensionSetupDirectory,
  openExtensionSetup,
  extensionSetupInstructions,
} from '../src/bridge/extension-setup.js';

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
  assert.deepEqual(calls[1]?.args, ['-R', path]);
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

test('extension CLI prints its absolute directory even when all desktop actions succeed', () => {
  const root = mkdtempSync(join(tmpdir(), 'pointdom-extension-output-'));
  try {
    const preload = join(root, 'desktop.mjs');
    writeFileSync(
      preload,
      `import childProcess from 'node:child_process';
      import { syncBuiltinESMExports } from 'node:module';
      const original = childProcess.execFileSync;
      childProcess.execFileSync = (command, ...args) =>
        ['/usr/bin/open', '/usr/bin/pbcopy'].includes(command) ? Buffer.alloc(0) : original(command, ...args);
      syncBuiltinESMExports();
      Object.defineProperty(process, 'platform', { value: 'darwin' });`,
    );
    const output = execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--import',
        pathToFileURL(preload).href,
        'src/bridge/main.ts',
        'extension',
      ],
      { encoding: 'utf8' },
    );
    assert.match(output, /Requested the extension folder selected in Finder/);
    assert.ok(
      output.includes(`Extension folder: ${realpathSync(resolve('src/extension'))}`),
      output,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('release setup provides one fixed directory, switches versions, preserves old files and refuses unrelated folders', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pointdom-extension-link-')));
  try {
    const entry = (version: string) => {
      const dist = join(root, 'versions', version, 'dist');
      mkdirSync(join(dist, 'bridge'), { recursive: true });
      mkdirSync(join(dist, 'extension'));
      writeFileSync(join(dist, 'extension/manifest.json'), '{}');
      return pathToFileURL(join(dist, 'bridge/main.js')).href;
    };
    const first = entry('0.2.1.first'),
      second = entry('0.2.2.second');
    assert.equal(extensionSetupDirectory(first), extensionDirectory(first));
    const shortcut = extensionSetupDirectory(first, true);
    assert.equal(shortcut, join(root, 'PointDOM Extension'));
    assert.equal(realpathSync(shortcut), shortcut);
    assert.equal(lstatSync(shortcut).isSymbolicLink(), false);
    assert.equal(extensionSetupDirectory(second), extensionDirectory(second));
    assert.ok(
      readFileSync(join(shortcut, '.pointdom-managed.json'), 'utf8').includes('0.2.1.first'),
    ); // --path does not modify it.
    assert.equal(extensionSetupDirectory(second, true), shortcut);
    assert.ok(
      readFileSync(join(shortcut, '.pointdom-managed.json'), 'utf8').includes('0.2.2.second'),
    );
    assert.equal(extensionSetupDirectory(second), shortcut);
    rmSync(shortcut, { recursive: true });
    mkdirSync(shortcut);
    writeFileSync(join(shortcut, 'keep.txt'), 'user data');
    assert.throws(() => extensionSetupDirectory(first, true), /regular file or folder/);
    assert.equal(realpathSync(shortcut), shortcut);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade reload opens Chrome without replacing the clipboard or opening Finder', () => {
  const calls: string[][] = [];
  const result = openExtensionSetup(
    '/fixture/PointDOM Extension',
    'darwin',
    (command, args) => {
      calls.push([command, ...args]);
    },
    'reload',
  );
  assert.deepEqual(result, { folderOpened: false, pathCopied: false, chromeOpened: true });
  assert.deepEqual(calls, [['/usr/bin/open', '-a', 'Google Chrome', 'chrome://extensions/']]);
  const failed = extensionSetupInstructions({
    path: '/fixture/PointDOM Extension',
    platform: 'darwin',
    pathCopied: false,
    folderOpened: false,
    chromeOpened: false,
  });
  assert.match(failed.join('\n'), /Cmd\+Shift\+G, enter \/fixture/);
  assert.doesNotMatch(failed.join('\n'), /copied|Requested/);
  const linux = extensionSetupInstructions({
    path: '/fixture/extension',
    platform: 'linux',
    pathCopied: false,
    folderOpened: false,
    chromeOpened: false,
  });
  assert.match(linux.join('\n'), /Select the whole extension folder/);
  assert.doesNotMatch(linux.join('\n'), /Cmd|Finder/);
});

test('manual ZIP exports contain the manifest at root and exclude installer markers', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pointdom-zip-fixture-')));
  let archive: string | undefined;
  try {
    const dist = join(root, 'dist');
    mkdirSync(join(dist, 'bridge'), { recursive: true });
    mkdirSync(join(dist, 'extension'));
    writeFileSync(join(dist, 'extension/manifest.json'), '{"manifest_version":3}');
    writeFileSync(join(dist, 'extension/.pointdom-managed.json'), 'private install path');
    writeFileSync(join(dist, 'extension/.DS_Store'), 'finder metadata');
    archive = extensionArchive(pathToFileURL(join(dist, 'bridge/main.js')).href);
    const files = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).trim().split('\n');
    assert.deepEqual(files, ['manifest.json']);
    assert.match(
      execFileSync('unzip', ['-p', archive, 'manifest.json'], { encoding: 'utf8' }),
      /manifest_version/,
    );
    assert.ok(readFileSync(join(dist, 'extension/.pointdom-managed.json'), 'utf8'));
  } finally {
    if (archive) rmSync(resolve(archive, '..'), { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  }
});

test('first-install instructions identify the selected folder and the chooser context explicitly', () => {
  const lines = extensionSetupInstructions({
    path: '/fixture/PointDOM Extension',
    platform: 'darwin',
    pathCopied: true,
    folderOpened: true,
    chromeOpened: true,
  }).join('\n');
  assert.match(lines, /Drag the selected extension folder onto the Chrome extensions page/);
  assert.match(lines, /folder chooser, not the Chrome address bar/);
  assert.match(lines, /manifest.json directly/);
  assert.match(lines, /PointDOM card to appear/);
  assert.match(lines, /pdo extension --zip/);
  assert.ok(lines.indexOf('Drag the selected') < lines.indexOf('Click Load unpacked'));
});

test('ZIP setup opens Chrome then selects the archive in Finder without changing the clipboard', () => {
  const calls: string[][] = [];
  const zip = '/fixture/pointdom-extension.zip';
  const result = openExtensionSetup(
    zip,
    'darwin',
    (command, args) => {
      calls.push([command, ...args]);
    },
    'zip',
  );
  assert.deepEqual(calls, [
    ['/usr/bin/open', '-a', 'Google Chrome', 'chrome://extensions/'],
    ['/usr/bin/open', '-R', zip],
  ]);
  assert.deepEqual(result, { chromeOpened: true, folderOpened: true, pathCopied: false });
  const output = extensionSetupInstructions({
    path: zip,
    format: 'zip',
    platform: 'darwin',
    ...result,
  }).join('\n');
  assert.match(output, /Drag pointdom-extension.zip from Finder/);
  assert.match(output, /Do not unzip it or click Load unpacked/);
  assert.doesNotMatch(output, /Cmd\+Shift\+G|Extension folder:|folder chooser/);
});
