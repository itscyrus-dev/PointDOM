import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const output = resolve('dist/release');
for (const line of (await readFile(`${output}/SHA256SUMS`, 'utf8')).trim().split('\n')) {
  const [hash, name] = line.split(/\s+/);
  assert.equal(
    createHash('sha256')
      .update(await readFile(`${output}/${name}`))
      .digest('hex'),
    hash,
  );
}
const directory = await mkdtemp(join(tmpdir(), 'pointdom-release-'));
try {
  execFileSync('tar', ['-xzf', `${output}/pointdom.tar.gz`, '-C', directory]);
  const app = join(directory, 'pointdom');
  // Runs without node_modules: verifies the delivered CLI really includes runtime dependencies.
  const result = execFileSync(process.execPath, [`${app}/dist/bridge/main.js`, '--help'], {
    cwd: directory,
    env: { ...process.env, PAGEPATCH_HOME: join(directory, 'state') },
    encoding: 'utf8',
  });
  assert.match(result, /pdo link/);
  const version = JSON.parse(await readFile(`${app}/package.json`, 'utf8')).version;
  for (const option of ['version', '-v', '--version']) {
    assert.equal(
      execFileSync(process.execPath, [`${app}/dist/bridge/main.js`, option], {
        cwd: directory,
        encoding: 'utf8',
      }).trim(),
      `pdo ${version}`,
    );
  }
  assert.ok(
    (await readFile(`${output}/install.sh`, 'utf8')).includes(`releases/download/v${version}`),
  );

  assert.equal(
    JSON.parse(await readFile(`${app}/dist/extension/manifest.json`, 'utf8')).manifest_version,
    3,
  );
  assert.match(await readFile(`${app}/LICENSE`, 'utf8'), /MIT License/);
  assert.ok((await readFile(`${app}/THIRD_PARTY_NOTICES.txt`, 'utf8')).includes('hono'));
  execFileSync('unzip', ['-t', `${output}/pointdom-extension.zip`], { stdio: 'pipe' });
  console.log('Release checksums, standalone CLI, extension ZIP and license notices: passed');
} finally {
  await rm(directory, { recursive: true, force: true });
}
