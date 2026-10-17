import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import {
  assetName,
  checksum,
  releaseTarget,
  releaseTargets,
  releaseVersion,
  verifyChecksums,
} from '../scripts/release-utils.js';

test('release platforms include Apple Silicon, Windows and Linux, but no Intel Mac', () => {
  assert.equal(releaseTarget('darwin', 'arm64').triple, 'aarch64-apple-darwin');
  assert.deepEqual(releaseTarget('win32', 'x64').installers, ['.exe']);
  assert.deepEqual(releaseTarget('linux', 'x64').installers, ['.deb', '.AppImage']);
  assert.throws(() => releaseTarget('darwin', 'x64'), /Unsupported/);
  assert.throws(() => releaseTarget('linux', 'arm64'), /Unsupported/);
});

test('release versions agree and reject a mismatched tag', async () => {
  const version = await releaseVersion();
  assert.equal(await releaseVersion('.', `v${version}`), version);
  await assert.rejects(releaseVersion('.', 'v0.0.0'), /mismatch/);
});

test('release manifests reject corruption, duplicate names and path traversal', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pointdom-release-'));
  try {
    await writeFile(join(directory, 'fixture.zip'), 'fixture');
    const line = `${await checksum(directory, 'fixture.zip')}  fixture.zip\n`;
    await writeFile(join(directory, 'SHA256SUMS'), line);
    assert.deepEqual(await verifyChecksums(directory, 'SHA256SUMS'), ['fixture.zip']);
    await writeFile(join(directory, 'SHA256SUMS'), line + line);
    await assert.rejects(verifyChecksums(directory, 'SHA256SUMS'), /Duplicate/);
    await writeFile(join(directory, 'SHA256SUMS'), line);
    await writeFile(join(directory, 'fixture.zip'), 'corrupted');
    await assert.rejects(verifyChecksums(directory, 'SHA256SUMS'), /Checksum mismatch/);
    assert.throws(() => assetName('../secret'), /Invalid/);
    assert.throws(() => assetName('C:\\secret'), /Invalid/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('publisher requires all platforms and rejects an unexpected or damaged asset', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pointdom-publisher-'));
  const script = resolve('scripts/verify-native-release.mjs');
  try {
    for (const name of [
      'package.json',
      'Cargo.toml',
      'src-tauri/tauri.conf.json',
      'src/extension/manifest.json',
    ]) {
      await mkdir(join(directory, name, '..'), { recursive: true });
      await cp(name, join(directory, name));
    }
    await mkdir(join(directory, 'dist/extension'), { recursive: true });
    await cp('src/extension/manifest.json', join(directory, 'dist/extension/manifest.json'));
    const output = join(directory, 'dist/release');
    await mkdir(output);
    const version = await releaseVersion();
    for (const { triple, installers } of Object.values(releaseTargets)) {
      const names = [
        `pointdom-${version}-${triple}.${triple.includes('windows') ? 'zip' : 'tar.gz'}`,
        ...installers.map((suffix) => `fixture-${triple}${suffix}`),
      ];
      if (triple.includes('apple')) names.push(`pointdom-extension-${version}.zip`);
      for (const name of names) await writeFile(join(output, name), 'fixture');
      await writeFile(
        join(output, `${triple}.sha256`),
        (
          await Promise.all(names.map(async (name) => `${await checksum(output, name)}  ${name}`))
        ).join('\n') + '\n',
      );
    }
    const run = () =>
      execFileSync(process.execPath, [script, '--all'], {
        cwd: directory,
        stdio: 'pipe',
        env: { ...process.env, RELEASE_TAG: `v${version}` },
      });
    run();
    assert.equal((await readFile(join(output, 'SHA256SUMS'), 'utf8')).trim().split('\n').length, 8);
    await writeFile(join(output, 'unexpected.zip'), 'unexpected');
    assert.throws(run);
    await rm(join(output, 'unexpected.zip'));
    const linux = join(output, 'x86_64-unknown-linux-gnu.sha256');
    const original = await readFile(linux, 'utf8');
    await writeFile(
      linux,
      original
        .split('\n')
        .filter((line) => !line.endsWith('.deb'))
        .join('\n'),
    );
    assert.throws(run);
    await writeFile(linux, original);
    await writeFile(join(output, 'fixture-x86_64-unknown-linux-gnu.deb'), 'corrupted');
    assert.throws(run);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
