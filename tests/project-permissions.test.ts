import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/bridge/store.js';
import { Queue } from '../src/bridge/queue.js';
import { createApp } from '../src/bridge/server.js';
import { fixtureDelivery } from './delivery-fixture.js';

test('project permissions require a paired client, validate scope, persist and snapshot only new tasks', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pointdom-project-permissions-'));
  try {
    const store = new Store(directory);
    const origin = `chrome-extension://${'a'.repeat(32)}`;
    const site = 'http://localhost:5173';
    const project = { id: randomUUID(), name: 'fixture', cwd: directory, origins: [site] };
    const other = { ...project, id: randomUUID(), origins: ['http://localhost:5174'] };
    store.config.projects.push(project, other);
    const queue = new Queue(store);
    const app = createApp(store, queue, 4318, fixtureDelivery);
    const call = (path: string, body: unknown, extra: Record<string, string> = {}) =>
      app.request(`http://127.0.0.1:4318${path}`, {
        method: 'POST',
        headers: {
          Host: '127.0.0.1:4318',
          Origin: origin,
          Authorization: `Bearer ${store.config.token}`,
          'Content-Type': 'application/json',
          ...extra,
        },
        body: JSON.stringify(body),
      });
    const path = `/api/projects/${project.id}/permissions`;
    const permissions = { confirmation: 'reduced' as const, codexNetwork: true };
    const input = { origin: site, permissions };
    assert.equal((await call(path, input)).status, 403);
    assert.equal((await call('/api/pair', {})).status, 200);
    assert.equal((await call(path, input, { Origin: 'https://evil.test' })).status, 403);
    assert.equal((await call(path, input, { Authorization: 'Bearer wrong' })).status, 401);
    assert.equal((await call(path, { ...input, origin: 'http://localhost:5174' })).status, 404);
    assert.equal((await call(path, { ...input, cwd: '/tmp/other' })).status, 400);
    assert.equal(
      (await call(path, { ...input, permissions: { confirmation: 'bypass', codexNetwork: true } }))
        .status,
      400,
    );
    const submit = () =>
      queue.submit({
        executor: 'mcp',
        id: randomUUID(),
        projectId: project.id,
        instruction: '调整高度',
        selection: {
          url: `${site}/`,
          title: 'fixture',
          selector: 'button',
          label: '按钮',
          tag: 'button',
          viewport: { width: 100, height: 100 },
          rect: { x: 0, y: 0, width: 10, height: 10 },
          styles: {},
        },
      });
    const before = submit();
    assert.equal((await call(path, input)).status, 200);
    const after = submit();
    assert.equal(before.permissions, undefined);
    assert.deepEqual(after.permissions, permissions);
    assert.equal(store.project(other.id)?.permissions, undefined);
    assert.equal(
      (
        await call('/api/jobs', {
          executor: after.executor,
          id: randomUUID(),
          projectId: after.projectId,
          instruction: after.instruction,
          selection: after.selection,
          permissions,
        })
      ).status,
      400,
    );
    await call(path, {
      origin: site,
      permissions: { confirmation: 'default', codexNetwork: false },
    });
    assert.deepEqual(
      after.permissions,
      permissions,
      'later settings must not change queued task authorization',
    );
    const reloaded = new Store(directory);
    assert.deepEqual(reloaded.project(project.id)?.permissions, {
      confirmation: 'default',
      codexNetwork: false,
    });
    assert.deepEqual(reloaded.jobs.find((job) => job.id === after.id)?.permissions, permissions);
    assert.equal(reloaded.project(other.id)?.permissions, undefined);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
