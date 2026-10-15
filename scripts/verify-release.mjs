import { mkdtemp, readFile, rm, mkdir, writeFile, realpath } from 'node:fs/promises';
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
const directory = await realpath(await mkdtemp(join(tmpdir(), 'pointdom-release-')));
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
  const extensionPath = execFileSync(
    process.execPath,
    [`${app}/dist/bridge/main.js`, 'extension', '--path'],
    { cwd: directory, encoding: 'utf8' },
  ).trim();
  assert.equal(extensionPath, `${app}/dist/extension`);
  // Verify the shipped CLI can generate CC Switch imports without source scripts or node_modules.
  const state = join(directory, 'state');
  await mkdir(state, { recursive: true });
  await writeFile(
    join(state, 'config.json'),
    JSON.stringify({ token: 'fixture-do-not-export', projects: [{ cwd: directory }] }),
  );
  const connect = (option) =>
    execFileSync(process.execPath, [`${app}/dist/bridge/main.js`, 'connect', option], {
      cwd: directory,
      env: { ...process.env, PAGEPATCH_HOME: state },
      encoding: 'utf8',
    });
  const exported = connect('--json');
  assert.ok(!exported.includes('fixture-do-not-export'));
  const connection = Object.values(JSON.parse(exported).mcpServers)[0];
  assert.deepEqual(connection.args, [`${app}/dist/bridge/mcp.js`, '--project', directory]);
  const link = new URL(connect('--url').trim());
  assert.equal(link.searchParams.get('apps'), 'opencode');
  assert.deepEqual(
    JSON.parse(Buffer.from(link.searchParams.get('config'), 'base64').toString('utf8')),
    JSON.parse(exported),
  );
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
