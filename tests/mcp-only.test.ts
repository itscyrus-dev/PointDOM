import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/bridge/store.js';
import { Queue } from '../src/bridge/queue.js';
import { createApp } from '../src/bridge/server.js';
import { buildSync } from 'esbuild';
import { readFileSync } from 'node:fs';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'pointdom-mcp-only-'));
  const store = new Store(directory);
  const project = {
    id: randomUUID(),
    name: 'Fixture',
    cwd: directory,
    origins: ['http://localhost:5173'],
  };
  store.config.projects.push(project);
  const client = `chrome-extension://${'a'.repeat(32)}`;
  store.config.clients.push(client);
  const queue = new Queue(store);
  const connection = queue.agents.register({
    projectId: project.id,
    claim: randomUUID(),
    client: { name: 'Fixture', version: '1' },
  });
  const app = createApp(store, queue, 4318);
  const call = (path: string, body?: unknown) =>
    app.request(`http://127.0.0.1:4318${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Host: '127.0.0.1:4318',
        Origin: client,
        Authorization: `Bearer ${store.config.token}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const input = {
    id: randomUUID(),
    projectId: project.id,
    recipientId: connection.id,
    instruction: 'Change height',
    selection: {
      url: 'http://localhost:5173/',
      title: 'Fixture',
      selector: 'button',
      label: 'Send',
      tag: 'button',
      viewport: { width: 500, height: 500 },
      rect: { x: 0, y: 0, width: 80, height: 32 },
      styles: {},
    },
  };
  return {
    directory,
    store,
    project,
    call,
    input,
    close: () => rmSync(directory, { recursive: true, force: true }),
  };
}

test('all submissions use MCP, including legacy CLI choices and execution overrides', async () => {
  const f = fixture();
  try {
    f.store.config.projects[0]!.permissions = { confirmation: 'reduced', codexNetwork: true };
    for (const executor of ['codex', 'opencode', 'claude', 'trae', 'mcp']) {
      const response = await f.call('/api/jobs', {
        ...f.input,
        id: randomUUID(),
        executor,
        execution: { approvalPolicy: 'never', autoCommit: true, model: 'old-model' },
      });
      assert.equal(response.status, 202);
      const { job } = await response.json();
      assert.equal(job.executor, 'mcp');
      assert.equal(job.execution, undefined);
      assert.equal(job.permissions, undefined);
      assert.equal(job.status, 'queued');
      assert.equal(job.startedAt, undefined);
    }
    assert.equal(f.store.jobs.length, 5);
    await new Promise<void>((done) => setImmediate(done));
    assert.ok(f.store.jobs.every((job) => job.status === 'queued' && !job.startedAt));
  } finally {
    f.close();
  }
});

test('the runtime import graph contains no agent runners or provider SDK', () => {
  const build = buildSync({
    entryPoints: ['src/bridge/main.ts'],
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    packages: 'external',
    metafile: true,
    write: false,
  });
  for (const path of Object.keys(build.metafile!.inputs))
    assert.doesNotMatch(path, /src\/bridge\/(?:codex|claude|opencode|acp|commit)\.ts$/);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(pkg.dependencies['@anthropic-ai/claude-agent-sdk'], undefined);
  assert.equal(pkg.scripts['test:codex'], undefined);
  assert.equal(pkg.scripts['test:opencode'], undefined);
});

test('MCP project context never suggests retired model or permission policies to the client', async () => {
  const f = fixture();
  try {
    const project = f.store.config.projects[0]!;
    project.permissions = { confirmation: 'reduced', codexNetwork: true };
    project.openCodeModel = 'retired/model';
    const response = await f.call('/api/jobs', f.input);
    assert.equal(response.status, 202);
    const queue = new Queue(f.store),
      claim = randomUUID();
    queue.agents.register({
      projectId: project.id,
      claim,
      client: { name: 'Fixture', version: '1' },
    });
    const app = createApp(f.store, queue, 4318);
    const result = await app.request(
      `http://127.0.0.1:4318/api/mcp/tasks?projectId=${project.id}`,
      {
        headers: {
          Host: '127.0.0.1:4318',
          Authorization: `Bearer ${f.store.config.token}`,
          'X-PagePatch-MCP': '1',
          'X-PointDOM-Session': claim,
        },
      },
    );
    assert.equal(result.status, 200);
    const context = (await result.json()).project;
    assert.equal(context.cwd, project.cwd);
    assert.equal(context.permissions, undefined);
    assert.equal(context.openCodeModel, undefined);
    assert.deepEqual(f.store.config.projects[0]?.permissions, {
      confirmation: 'reduced',
      codexNetwork: true,
    });
  } finally {
    f.close();
  }
});

test('PointDOM no longer configures host permissions, approves commands or commits files', async () => {
  const f = fixture();
  try {
    const before = structuredClone(f.store.config);
    assert.equal(
      (
        await f.call(`/api/projects/${f.project.id}/permissions`, {
          origin: f.project.origins[0],
          permissions: { confirmation: 'reduced', codexNetwork: true },
        })
      ).status,
      410,
    );
    assert.equal((await f.call('/api/models')).status, 410);
    assert.equal((await f.call('/api/status')).status, 410);
    assert.equal((await f.call(`/api/jobs/${f.input.id}/commit`, {})).status, 410);
    assert.equal(
      (await f.call(`/api/jobs/${f.input.id}/approvals/old`, { decision: 'accept' })).status,
      410,
    );
    assert.deepEqual(f.store.config, before);
  } finally {
    f.close();
  }
});

test('generic MCP submissions ignore old auto-send opt-ins and persist no desktop delivery attempt', async () => {
  const f = fixture();
  try {
    f.store.config.traeAutoSend = true;
    f.store.saveConfig();
    const response = await f.call('/api/jobs', f.input);
    assert.equal(response.status, 202);
    const { job } = await response.json();
    assert.equal(job.delivery, undefined);
    assert.equal(job.status, 'queued');
    assert.equal(job.startedAt, undefined);
    await new Promise<void>((done) => setImmediate(done));
    const restored = new Store(f.directory);
    restored.recover();
    assert.equal(restored.jobs[0]?.delivery, undefined);
    assert.equal(restored.jobs[0]?.status, 'queued');
    assert.equal(restored.config.traeAutoSend, true, 'legacy config remains historical data');
  } finally {
    f.close();
  }
});

test('desktop delivery controls retire without changing project bindings or task history', async () => {
  const f = fixture();
  try {
    const before = structuredClone(f.store.config);
    for (const path of [
      `/api/projects/${f.project.id}/trae-handoff`,
      `/api/jobs/${f.input.id}/handoff`,
    ])
      assert.equal(
        (await f.call(path, { origin: f.project.origins[0], enabled: true })).status,
        410,
      );
    assert.equal((await f.call('/api/settings', { traeAutoSend: true })).status, 410);
    assert.deepEqual(f.store.config, before);
    assert.equal(f.store.jobs.length, 0);
  } finally {
    f.close();
  }
});

test('generic MCP runtime has no native client automation in its dependency graph', () => {
  const result = buildSync({
    entryPoints: ['src/bridge/main.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    metafile: true,
    write: false,
  });
  for (const path of Object.keys(result.metafile!.inputs))
    assert.doesNotMatch(path, /src\/bridge\/(?:delivery|client-handoff|trae-handoff)\.ts$/);
});

test('recovery keeps legacy delivery receipts readable without replaying or rewriting a queued annotation', async () => {
  const f = fixture();
  try {
    const response = await f.call('/api/jobs', f.input);
    assert.equal(response.status, 202);
    const job = f.store.jobs[0]!;
    job.delivery = {
      target: 'trae',
      fingerprint: '0'.repeat(64),
      state: 'pending',
      automatic: true,
      autoSend: { appId: 'cn.trae.app', conversation: 'Legacy chat' },
    };
    f.store.saveJobs();
    const before = structuredClone(job);
    const restored = new Store(f.directory);
    restored.recover();
    assert.deepEqual(restored.jobs[0], before);
  } finally {
    f.close();
  }
});
