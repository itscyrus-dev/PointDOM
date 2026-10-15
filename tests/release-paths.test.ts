import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs, {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  realpathSync,
  readlinkSync,
  lstatSync,
  symlinkSync,
  unlinkSync,
  rmSync,
} from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { activateRelease, releasePaths } from '../src/bridge/release-paths.js';
import { extensionSetupDirectory } from '../src/bridge/extension-setup.js';
import { connectionConfig } from '../src/bridge/connection.js';

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pointdom-release-paths-')));
  const release = (version: string) => {
    const dist = join(root, 'versions', version, 'dist');
    mkdirSync(join(dist, 'bridge'), { recursive: true });
    mkdirSync(join(dist, 'extension'));
    writeFileSync(join(dist, 'bridge/main.js'), '');
    writeFileSync(join(dist, 'bridge/mcp.js'), `console.log(${JSON.stringify(version)})`);
    writeFileSync(join(dist, 'extension/manifest.json'), JSON.stringify({ version }));
    return pathToFileURL(join(dist, 'bridge/main.js')).href;
  };
  const first = release('first'),
    second = release('second');
  return {
    root,
    first,
    second,
    paths: releasePaths(first)!,
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

test('fixed extension and MCP entries change releases without changing exported config or deleting old files', () => {
  const f = fixture();
  try {
    activateRelease(f.first);
    const state = { projects: [{ cwd: f.root }] };
    const config = (url: string) =>
      connectionConfig(state, f.root, f.root, fileURLToPath(new URL('./mcp.js', url)));
    const first = config(f.first);
    const server = Object.values(first.mcpServers)[0]!;
    assert.deepEqual(server.args, [
      join(f.root, 'current/dist/bridge/mcp.js'),
      '--project',
      f.root,
    ]);
    const run = () => execFileSync(server.command, server.args, { encoding: 'utf8' }).trim();
    assert.equal(run(), 'first');
    assert.equal(lstatSync(f.paths.extension).isSymbolicLink(), false);
    activateRelease(f.second);
    assert.deepEqual(config(f.second), first);
    assert.equal(run(), 'second');
    assert.equal(
      JSON.parse(readFileSync(join(f.paths.extension, 'manifest.json'), 'utf8')).version,
      'second',
    );
    assert.equal(
      JSON.parse(readFileSync(join(f.paths.release, 'dist/extension/manifest.json'), 'utf8'))
        .version,
      'first',
    );
    activateRelease(f.first); // An installer rollback restores both fixed entries.
    assert.equal(run(), 'first');
    assert.equal(
      JSON.parse(readFileSync(join(f.paths.extension, 'manifest.json'), 'utf8')).version,
      'first',
    );
  } finally {
    f.dispose();
  }
});

test('legacy extension aliases migrate only on an explicit setup and never modify their source release', () => {
  const f = fixture();
  try {
    const source = join(f.paths.release, 'dist/extension');
    symlinkSync(source, f.paths.extension, 'dir');
    assert.equal(extensionSetupDirectory(f.first), source);
    assert.equal(lstatSync(f.paths.extension).isSymbolicLink(), true);
    assert.equal(extensionSetupDirectory(f.first, true), f.paths.extension);
    assert.equal(lstatSync(f.paths.extension).isSymbolicLink(), false);
    assert.equal(realpathSync(f.paths.extension), f.paths.extension);
    assert.equal(JSON.parse(readFileSync(join(source, 'manifest.json'), 'utf8')).version, 'first');
  } finally {
    f.dispose();
  }
});

test('activation refuses unrelated directories and shortcuts before changing either installed entry', () => {
  const f = fixture();
  try {
    activateRelease(f.first);
    const before = readlinkSync(f.paths.current);
    rmSync(f.paths.extension, { recursive: true });
    mkdirSync(f.paths.extension);
    writeFileSync(join(f.paths.extension, 'keep.txt'), 'user data');
    assert.throws(() => activateRelease(f.second), /regular file or folder/);
    assert.equal(readlinkSync(f.paths.current), before);
    assert.equal(readFileSync(join(f.paths.extension, 'keep.txt'), 'utf8'), 'user data');
    rmSync(f.paths.extension, { recursive: true });
    extensionSetupDirectory(f.first, true);
    unlinkSync(f.paths.current);
    symlinkSync(f.root, f.paths.current, 'dir');
    assert.throws(() => activateRelease(f.second), /unrelated/);
    assert.equal(
      JSON.parse(readFileSync(join(f.paths.extension, 'manifest.json'), 'utf8')).version,
      'first',
    );
    assert.equal(readlinkSync(f.paths.current), f.root);
  } finally {
    f.dispose();
  }
});

test('a failed MCP link switch rolls back the staged extension and preserves the previous release', () => {
  const f = fixture();
  try {
    activateRelease(f.first);
    const original = fs.renameSync;
    const replacement = mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
      if (to === f.paths.current) throw new Error('fixture rename failure');
      return original(from, to);
    });
    syncBuiltinESMExports();
    try {
      assert.throws(() => activateRelease(f.second), /fixture rename failure/);
    } finally {
      replacement.mock.restore();
      syncBuiltinESMExports();
    }
    assert.equal(realpathSync(f.paths.current), f.paths.release);
    assert.equal(
      JSON.parse(readFileSync(join(f.paths.extension, 'manifest.json'), 'utf8')).version,
      'first',
    );
  } finally {
    f.dispose();
  }
});
