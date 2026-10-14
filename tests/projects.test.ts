import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/bridge/store.js';
import { Queue } from '../src/bridge/queue.js';
import { createApp } from '../src/bridge/server.js';
import { launchAgent } from '../src/bridge/service.js';

test('live project binding is local-only, idempotent and persisted across multiple projects', async () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'pointdom-bind-')));
  try {
    const store = new Store(join(directory, 'state'));
    const app = createApp(store, new Queue(store));
    const first = join(directory, 'one'),
      second = join(directory, 'two');
    mkdirSync(first);
    mkdirSync(second);
    const call = (body: unknown, headers: Record<string, string> = {}) =>
      app.request('http://127.0.0.1:4318/api/local/projects', {
        method: 'POST',
        headers: {
          Host: '127.0.0.1:4318',
          Authorization: `Bearer ${store.config.token}`,
          'X-PagePatch-Local': '1',
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
      });
    const binding = {
      path: first,
      name: 'one',
      origin: 'http://localhost:5173',
      model: 'provider/model',
    };
    assert.equal(
      (await call(binding, { Origin: 'chrome-extension://' + 'a'.repeat(32) })).status,
      403,
    );
    assert.equal((await call(binding, { Origin: 'http://localhost:5173' })).status, 403);
    assert.equal((await call(binding, { 'X-PagePatch-Client': 'a'.repeat(32) })).status, 403);
    assert.equal((await call(binding, { Authorization: 'Bearer wrong' })).status, 403);
    assert.equal((await call({ ...binding, path: '/' })).status, 400);
    assert.equal((await call({ ...binding, command: 'rm -rf' })).status, 400);
    assert.equal((await call({ ...binding, model: 'invalid' })).status, 400);
    const result = await (await call(binding)).json();
    const again = await (await call({ ...binding, origin: 'http://127.0.0.1:5173' })).json();
    assert.equal(again.project.id, result.project.id);
    assert.equal(store.config.projects.length, 1);
    assert.equal(
      (await call({ path: second, name: 'two', origin: 'http://localhost:5173' })).status,
      200,
    );
    assert.equal(store.config.projects.length, 2); // Ambiguous origins remain explicit choices in the panel.
    const reload = new Store(store.directory);
    assert.equal(reload.config.projects[0]!.openCodeModel, 'provider/model');
    assert.equal(reload.config.projects[0]!.origins.length, 2);
    assert.notEqual(reload.config.projects[0]!.id, reload.config.projects[1]!.id);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test('login service uses absolute executables, retains loopback bridge and stores no credentials', () => {
  const xml = launchAgent(
    '/node with spaces',
    '/tool & app/dist/main.js',
    '/state',
    '/opencode',
    '/bin',
  );
  assert.match(xml, /RunAtLoad/);
  assert.match(xml, /KeepAlive/);
  assert.match(xml, /tool &amp; app/);
  assert.match(xml, /PAGEPATCH_OPENCODE_BIN/);
  assert.equal(xml.includes('apiKey'), false);
  assert.equal(xml.includes('token'), false);
  assert.equal(xml.includes('OPENCODE_SERVER_PASSWORD'), false);
});
