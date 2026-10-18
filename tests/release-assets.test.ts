import { zipSync, strToU8 } from 'fflate';
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

test('release platforms support only Apple Silicon macOS', () => {
  assert.equal(releaseTarget('darwin', 'arm64').triple, 'aarch64-apple-darwin');
  assert.throws(() => releaseTarget('win32', 'x64'), /Unsupported/);
  assert.throws(() => releaseTarget('linux', 'x64'), /Unsupported/);
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

test('publisher requires the macOS assets and rejects an unexpected or damaged asset', async () => {
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
      const names = installers.map((suffix) => `fixture-${version}-${triple}${suffix}`);
      for (const name of names) await writeFile(join(output, name), 'fixture');
      const archive = `pointdom-extension-${version}.zip`;
      await writeFile(
        join(output, archive),
        zipSync({
          'manifest.json': strToU8(
            JSON.stringify({
              manifest_version: 3,
              version,
              background: { service_worker: 'worker.js' },
              side_panel: { default_path: 'panel.html' },
              icons: { 16: 'icon.png' },
            }),
          ),
          'worker.js': strToU8(''),
          'panel.html': strToU8(''),
          'icon.png': strToU8('fixture'),
        }),
      );
      names.push(archive);
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
    assert.equal((await readFile(join(output, 'SHA256SUMS'), 'utf8')).trim().split('\n').length, 2);
    await writeFile(join(output, 'unexpected.zip'), 'unexpected');
    assert.throws(run);
    await rm(join(output, 'unexpected.zip'));
    const manifest = join(output, 'aarch64-apple-darwin.sha256');
    const original = await readFile(manifest, 'utf8');
    await writeFile(
      manifest,
      original
        .split('\n')
        .filter((line) => !line.endsWith('.dmg'))
        .join('\n'),
    );
    assert.throws(run);
    await writeFile(
      manifest,
      original
        .split('\n')
        .filter((line) => !line.endsWith('.zip'))
        .join('\n'),
    );
    assert.throws(run);
    await writeFile(manifest, original);
    const archive = `pointdom-extension-${version}.zip`;
    const validArchive = await readFile(join(output, archive));
    for (const extensionVersion of ['0.0.0', version]) {
      await writeFile(
        join(output, archive),
        zipSync({
          'manifest.json': strToU8(
            JSON.stringify({
              manifest_version: 3,
              version: extensionVersion,
              background: { service_worker: 'missing.js' },
            }),
          ),
        }),
      );
      await writeFile(
        manifest,
        original.replace(
          /^[a-f0-9]{64}(?=  pointdom-extension-)/m,
          await checksum(output, archive),
        ),
      );
      assert.throws(
        run,
        extensionVersion === version ? /Missing extension resource/ : /manifest\/version mismatch/,
      );
    }
    await writeFile(join(output, archive), validArchive);
    await writeFile(manifest, original);
    await writeFile(join(output, `fixture-${version}-aarch64-apple-darwin.dmg`), 'corrupted');
    assert.throws(run);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
