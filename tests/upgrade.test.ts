import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyInstaller } from '../src/bridge/upgrade.js';
import { Store } from '../src/bridge/store.js';
import { Queue } from '../src/bridge/queue.js';
import { createApp } from '../src/bridge/server.js';

test('upgrade rejects tampered installers and missing checksums', () => {
  const script = '#!/bin/sh\nexit 0\n';
  const hash = createHash('sha256').update(script).digest('hex');
  verifyInstaller(script, `${hash}  install.sh\n`);
  assert.throws(
    () => verifyInstaller(script + 'changed', `${hash}  install.sh`),
    /checksum mismatch/,
  );
  assert.throws(() => verifyInstaller(script, `${hash}  other.sh`), /checksum mismatch/);
});

test('upgrade handshake refuses active tasks and blocks submissions and MCP claims until released', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pointdom-upgrade-'));
  try {
    const store = new Store(directory);
    const projectId = randomUUID();
    store.config.projects.push({
      id: projectId,
      name: 'fixture',
      cwd: directory,
      origins: ['http://localhost:5173'],
    });
    const queue = new Queue(store);
    const app = createApp(store, queue);
    const call = (path: string, body: unknown = {}) =>
      app.request(`http://127.0.0.1:4318${path}`, {
        method: 'POST',
        headers: {
          Host: '127.0.0.1:4318',
          Authorization: `Bearer ${store.config.token}`,
          'X-PagePatch-Local': '1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    const job = queue.submit({
      id: randomUUID(),
      projectId,
      executor: 'mcp',
      instruction: 'fixture',
      selection: {
        url: 'http://localhost:5173',
        title: '',
        selector: 'button',
        label: '',
        tag: 'button',
        viewport: { width: 100, height: 100 },
        rect: { x: 0, y: 0, width: 20, height: 20 },
        styles: {},
      },
    });
    assert.equal((await call('/api/local/upgrade/prepare')).status, 409);
    queue.cancel(job.id);
    assert.equal((await call('/api/local/upgrade/prepare')).status, 200);
    const headers = {
      Host: '127.0.0.1:4318',
      Authorization: `Bearer ${store.config.token}`,
      'X-PagePatch-MCP': '1',
    };
    assert.equal(
      (
        await app.request(`http://127.0.0.1:4318/api/mcp/tasks/${job.id}/claim`, {
          method: 'POST',
          headers,
        })
      ).status,
      503,
    );
    assert.equal((await call('/api/local/upgrade/release')).status, 200);
    assert.notEqual(
      (
        await app.request(`http://127.0.0.1:4318/api/mcp/tasks/${job.id}/claim`, {
          method: 'POST',
          headers,
        })
      ).status,
      503,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
