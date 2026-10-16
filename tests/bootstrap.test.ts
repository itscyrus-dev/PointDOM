import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BootstrapGrants } from '../src/bridge/bootstrap.js';
import { createApp } from '../src/bridge/server.js';
import { Store } from '../src/bridge/store.js';
import { Queue } from '../src/bridge/queue.js';
import { localInstallCommand } from '../src/extension/local-install.js';
import { windowsServiceCommand } from '../src/bridge/service.js';

const id = 'a'.repeat(32),
  nonce = 'e'.repeat(64);
const challenge = createHash('sha256').update(nonce).digest('hex');
test('browser authorization is origin-bound, bounded, replaced and expires without persisting capabilities', () => {
  let now = 0;
  const grants = new BootstrapGrants(() => now);
  grants.authorize({ extensionId: id, challenge });
  assert.ok(grants.allows(`chrome-extension://${id}`, nonce));
  assert.ok(!grants.allows(`chrome-extension://${'b'.repeat(32)}`, nonce));
  assert.ok(!grants.allows(`chrome-extension://${id}`, 'd'.repeat(64)));
  grants.authorize({
    extensionId: id,
    challenge: createHash('sha256').update('d'.repeat(64)).digest('hex'),
  });
  assert.ok(!grants.allows(`chrome-extension://${id}`, nonce));
  now = 15 * 60_000;
  assert.ok(!grants.allows(`chrome-extension://${id}`, 'd'.repeat(64)));
  for (let index = 0; index < 32; index++) {
    const extensionId = index
      .toString(16)
      .split('')
      .map((digit) => String.fromCharCode(97 + parseInt(digit, 16)))
      .join('')
      .padStart(32, 'a');
    grants.authorize({ extensionId, challenge });
  }
  assert.throws(() => grants.authorize({ extensionId: 'p'.repeat(32), challenge }), /Too many/);
  now += 15 * 60_000;
  assert.doesNotThrow(() => grants.authorize({ extensionId: 'p'.repeat(32), challenge }));
});
test('discovery never exposes a credential until the local CLI explicitly authorizes this exact extension challenge', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pointdom-bootstrap-'));
  try {
    const store = new Store(directory),
      app = createApp(store, new Queue(store));
    const before = readFileSync(join(directory, 'config.json'), 'utf8');
    const request = (path: string, body: unknown, headers: Record<string, string> = {}) =>
      app.request(`http://127.0.0.1:4318${path}`, {
        method: 'POST',
        headers: { Host: '127.0.0.1:4318', 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    const origin = { Origin: `chrome-extension://${id}` };
    let response = await request('/api/bootstrap', { nonce }, origin);
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { available: true, authorized: false });
    assert.equal(
      (await request('/api/bootstrap', { nonce }, { 'X-PagePatch-Client': id })).status,
      403,
    );
    assert.equal(
      (await request('/api/bootstrap', { nonce }, { Origin: 'https://evil.example' })).status,
      403,
    );
    assert.equal(
      (await request('/api/bootstrap', { nonce }, { ...origin, Host: 'evil.example' })).status,
      403,
    );
    assert.equal(
      (await request('/api/local/bootstrap', { extensionId: id, challenge }, origin)).status,
      403,
    );
    const local = { Authorization: `Bearer ${store.config.token}`, 'X-PagePatch-Local': '1' };
    assert.equal(
      (await request('/api/local/bootstrap', { extensionId: id, challenge: 'bad' }, local)).status,
      400,
    );
    assert.equal(
      (await request('/api/local/bootstrap', { extensionId: id, challenge, cwd: '/tmp' }, local))
        .status,
      400,
    );
    assert.equal(
      (await request('/api/local/bootstrap', { extensionId: id, challenge }, local)).status,
      200,
    );
    assert.equal((await request('/api/bootstrap', { nonce: 'd'.repeat(64) }, origin)).status, 202);
    assert.equal(
      (
        await request(
          '/api/bootstrap',
          { nonce },
          { Origin: `chrome-extension://${'b'.repeat(32)}` },
        )
      ).status,
      202,
    );
    assert.equal(
      (await request('/api/bootstrap', { nonce: challenge }, origin)).status,
      202,
      'Public command challenge is not a browser credential',
    );
    response = await request('/api/bootstrap', { nonce }, origin);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).token, store.config.token);
    assert.equal(readFileSync(join(directory, 'config.json'), 'utf8'), before);
    assert.equal(store.config.clients.length, 0);
    assert.equal(
      (
        await app.request('http://127.0.0.1:4318/api/projects', {
          headers: { Host: '127.0.0.1:4318', ...origin },
        })
      ).status,
      401,
    );
    assert.equal(
      (await request('/api/pair', {}, { ...origin, Authorization: `Bearer ${store.config.token}` }))
        .status,
      200,
    );
    assert.deepEqual(store.config.clients, [origin.Origin]);
    // A new server process cannot reuse an old in-memory authorization.
    const restarted = createApp(store, new Queue(store));
    assert.equal(
      (
        await restarted.request('http://127.0.0.1:4318/api/bootstrap', {
          method: 'POST',
          headers: { Host: '127.0.0.1:4318', ...origin, 'Content-Type': 'application/json' },
          body: JSON.stringify({ nonce }),
        })
      ).status,
      202,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test('one-line install commands use fixed release URLs and reject injected shell values', () => {
  const mac = localInstallCommand('mac', id, challenge, '0.3.1');
  const win = localInstallCommand('win', id, challenge, '0.3.1');
  assert.match(
    mac,
    /curl -fsSL https:\/\/github.com\/itscyrus-dev\/PointDOM\/releases\/download\/v0.3.1\/install.sh/,
  );
  assert.match(mac, /sh -s -- --extension-id/);
  assert.match(win, /install.ps1/);
  assert.ok(!mac.includes('\n') && !win.includes('\n'));
  assert.doesNotMatch(win, /ExecutionPolicy|Bypass|RunAs/);
  for (const bad of ['$(touch hacked)', 'a; echo secret', '\n', 'A'.repeat(64)])
    assert.throws(() => localInstallCommand('mac', id, bad, '0.3.1'));
  assert.throws(() => localInstallCommand('mac', id, nonce, '0.3.1;whoami'));
  assert.equal(
    windowsServiceCommand("C:\\O'Brien\\node.exe", 'C:\\App Space\\main.js', 'C:\\State $secret'),
    "$env:PAGEPATCH_HOME='C:\\State $secret'; & 'C:\\O''Brien\\node.exe' 'C:\\App Space\\main.js' serve",
  );
});

test('pair help and invalid flags never print the saved credential or a Node stack', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pointdom-pair-options-'));
  try {
    const store = new Store(directory);
    for (const args of [['--help'], ['--unknown'], ['--nonce', 'a'.repeat(64)]]) {
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', resolve('src/bridge/main.ts'), 'pair', ...args],
        { env: { ...process.env, PAGEPATCH_HOME: directory }, encoding: 'utf8' },
      );
      assert.equal(result.status, args[0] === '--help' ? 0 : 1);
      assert.doesNotMatch(result.stdout + result.stderr, new RegExp(store.config.token));
      assert.doesNotMatch(result.stderr, /at async|node:internal|main.ts:\d+/);
      if (args[0] === '--help') assert.match(result.stdout, /--challenge/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
