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
  for (const file of [
    'README.md',
    'CHANGELOG.md',
    'docs/README.md',
    'docs/INSTALL_AGENT.md',
    'docs/MCP.md',
    'docs/agents/CODEX.md',
    'docs/agents/CLAUDE_CODE.md',
    'docs/agents/OPENCODE.md',
    'docs/agents/TRAE.md',
    'docs/agents/GENERIC_MCP.md',
  ]) {
    const text = await readFile(join(app, file), 'utf8');
    assert.ok(text.length > 200, `Missing installation documentation: ${file}`);
    const prose = file === 'README.md' ? text.replaceAll('简体中文', '') : text;
    assert.equal(/\p{Script=Han}/u.test(prose), false, `Documentation must be English: ${file}`);
  }
  const englishReadme = await readFile(join(app, 'README.md'), 'utf8');
  const chineseReadme = await readFile(join(app, 'README.zh-CN.md'), 'utf8');
  assert.match(chineseReadme, /所有支持本地 stdio MCP/);
  assert.match(englishReadme, /OpenCode is not required/);
  assert.match(englishReadme, /href="README\.zh-CN\.md"/);
  assert.match(chineseReadme, /href="README\.md"/);
  for (const readme of [englishReadme, chineseReadme]) {
    assert.equal(
      (readme.match(/<img\b/g) || []).length,
      1,
      'README contains only the project logo',
    );
    assert.match(readme, /src="docs\/assets\/pointdom\.svg"/);
  }
  assert.match(await readFile(join(app, 'docs/assets/pointdom.svg'), 'utf8'), /<svg/);
  assert.match(await readFile(join(app, 'INSTALL.md'), 'utf8'), /docs\/INSTALL_AGENT\.md/);
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
  const setupHelp = execFileSync(
    process.execPath,
    [`${app}/dist/bridge/main.js`, 'setup', '--help'],
    { cwd: directory, encoding: 'utf8' },
  );
  assert.match(setupHelp, /Guided project/);
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
  const standard = execFileSync(process.execPath, [`${app}/dist/bridge/main.js`, 'connect'], {
    cwd: directory,
    env: { ...process.env, PAGEPATCH_HOME: state },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.deepEqual(JSON.parse(standard), JSON.parse(exported));
  const native = execFileSync(
    process.execPath,
    [`${app}/dist/bridge/main.js`, 'connect', '--client', 'opencode', '--json'],
    { cwd: directory, env: { ...process.env, PAGEPATCH_HOME: state }, encoding: 'utf8' },
  );
  const nativeServer = Object.values(JSON.parse(native).mcp)[0];
  assert.deepEqual(nativeServer.command, [connection.command, ...connection.args]);
  assert.deepEqual(nativeServer.environment, connection.env);
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
  const manifest = JSON.parse(await readFile(`${app}/dist/extension/manifest.json`, 'utf8'));
  assert.equal(manifest.version, version, 'Chrome and CLI versions must match');
  for (const size of [16, 32, 48, 128]) {
    assert.equal(manifest.action.default_icon[size], manifest.icons[size]);
    const png = await readFile(`${app}/dist/extension/${manifest.icons[size]}`);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
  }
  const panelHtml = await readFile(`${app}/dist/extension/panel.html`, 'utf8');
  assert.match(panelHtml, /heroui\.css/);
  assert.match(panelHtml, /palette\.css/);
  assert.ok(
    (await readFile(`${app}/dist/extension/palette.css`, 'utf8')).includes('--palette-lime'),
  );
  assert.ok((await readFile(`${app}/dist/extension/heroui.css`, 'utf8')).length > 1000);
  for (const locale of ['en', 'zh_CN']) {
    const messages = JSON.parse(
      await readFile(`${app}/dist/extension/_locales/${locale}/messages.json`, 'utf8'),
    );
    assert.ok(messages.extensionName.message.includes('PointDOM'));
  }
  assert.match(await readFile(`${app}/LICENSE`, 'utf8'), /MIT License/);
  assert.ok((await readFile(`${app}/THIRD_PARTY_NOTICES.txt`, 'utf8')).includes('hono'));
  assert.ok((await readFile(`${app}/THIRD_PARTY_NOTICES.txt`, 'utf8')).includes('@heroui/react'));
  execFileSync('unzip', ['-t', `${output}/pointdom-extension.zip`], { stdio: 'pipe' });
  console.log(
    'Release checksums, standalone CLI, installation guides, extension ZIP and license notices: passed',
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
