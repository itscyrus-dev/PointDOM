import { watchInstruction } from '../src/shared/mcp-watch.js';
import { mcpEntryForService } from '../src/bridge/connection.js';
import { waitForTask } from '../src/bridge/task-wait.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/bridge/store.js';
import { Queue } from '../src/bridge/queue.js';
import { createApp } from '../src/bridge/server.js';

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
  const claim = randomUUID();
  const connection = queue.agents.register({
    projectId: project.id,
    claim,
    client: { name: 'Fixture', version: '1' },
  });
  const entry = join(directory, 'mcp.js');
  writeFileSync(entry, '// Isolated config export fixture');
  const app = createApp(store, queue, 4318, entry);
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
    claim,
    connection,
    app,
    queue,
    store,
    project,
    call,
    input,
    close: () => rmSync(directory, { recursive: true, force: true }),
  };
}

test('MCP browser submissions require a listening recipient and preserve CLI-independent settings', async () => {
  const f = fixture();
  try {
    assert.equal((await f.call('/api/settings', { executor: 'mcp' })).status, 200);
    assert.equal(new Store(f.directory).config.defaultExecutor, 'mcp');
    assert.equal((await f.call('/api/jobs', { ...f.input, executor: 'mcp' })).status, 409);
    const abort = new AbortController();
    const wait = waitForTask(f.store, f.queue.agents, f.project.id, f.claim, 1000, abort.signal);
    const response = await f.call('/api/jobs', { ...f.input, executor: 'mcp' });
    assert.equal(response.status, 202);
    assert.equal((await wait).taskId, f.input.id);
    assert.equal(f.store.jobs[0]?.status, 'queued');
    assert.equal(f.queue.agents.get(f.connection.id, f.project.id)?.listening, false);
    assert.equal((await f.call('/api/jobs', { ...f.input, executor: 'mcp' })).status, 202);
    assert.equal(f.store.jobs.length, 1);
    assert.equal(
      (await f.call('/api/jobs', { ...f.input, id: randomUUID(), executor: 'mcp' })).status,
      409,
    );
  } finally {
    f.close();
  }
});

test('a wait cannot resume after disconnect and re-registration with the same identity', async () => {
  const f = fixture();
  try {
    const pending = waitForTask(
      f.store,
      f.queue.agents,
      f.project.id,
      f.claim,
      1000,
      new AbortController().signal,
    );
    f.queue.agents.disconnect(f.project.id, f.claim);
    f.queue.agents.register({
      projectId: f.project.id,
      claim: f.claim,
      client: { name: 'Fixture', version: '1' },
    });
    const abort = new AbortController();
    const newer = waitForTask(f.store, f.queue.agents, f.project.id, f.claim, 1000, abort.signal);
    await assert.rejects(pending, /MCP_SESSION_CLOSED/);
    assert.equal(f.queue.agents.get(f.connection.id, f.project.id)?.listening, true);
    abort.abort();
    await assert.rejects(newer, { name: 'AbortError' });
  } finally {
    f.close();
  }
});

test('paired browser exports one installation-scoped MCP config without credentials', async () => {
  const f = fixture();
  try {
    const r = await f.call('/api/mcp-config');
    assert.equal(r.status, 200);
    const data = await r.json();
    assert.deepEqual(Object.keys(data.mcpServers), ['pointdom']);
    assert.equal(data.mcpServers.pointdom.args.length, 1);
    assert.ok(!JSON.stringify(data).includes(f.store.config.token));
  } finally {
    f.close();
  }
});

test('watch instructions explicitly name the full claim/report loop in both languages', () => {
  const f = fixture();
  try {
    for (const language of ['en', 'zh-CN'] as const) {
      const text = watchInstruction(language, f.project, f.connection.id);
      for (const tool of [
        'bind_project',
        'wait_for_task',
        'get_task',
        'claim_task',
        'progress_task',
        'report_task',
      ])
        assert.ok(text.includes('pointdom_' + tool), tool);
      assert.ok(text.includes(f.project.cwd));
      assert.ok(text.includes(f.connection.id));
      assert.ok(!text.includes(f.store.config.token));
    }
  } finally {
    f.close();
  }
});
test('service stop ends outstanding MCP waits and clears presence', async () => {
  const f = fixture();
  try {
    const pending = waitForTask(
      f.store,
      f.queue.agents,
      f.project.id,
      f.claim,
      1000,
      new AbortController().signal,
    );
    f.queue.stop();
    await assert.rejects(pending, /MCP_SESSION_CLOSED/);
    assert.equal(f.queue.agents.list(f.project.id).length, 0);
  } finally {
    f.close();
  }
});

test('local status distinguishes CLI delivery from host-driven MCP listening', async () => {
  const f = fixture();
  try {
    const status = async () =>
      (
        await f.app.request('http://127.0.0.1:4318/api/local/status', {
          headers: {
            Host: '127.0.0.1:4318',
            Authorization: `Bearer ${f.store.config.token}`,
            'X-PagePatch-Local': '1',
          },
        })
      ).json();
    assert.equal((await status()).transport, 'cli');
    await f.call('/api/settings', { executor: 'mcp' });
    const mcp = await status();
    assert.equal(mcp.transport, 'mcp');
    assert.equal(mcp.automaticDelivery, false);
  } finally {
    f.close();
  }
});

test('source and bundled services resolve the built MCP entry without relying on cwd', () => {
  const root = join(tmpdir(), 'pointdom paths');
  for (const service of ['src/bridge/server.ts', 'dist/bridge/main.js']) {
    assert.equal(
      mcpEntryForService(pathToFileURL(join(root, service)).href),
      join(root, 'dist/bridge/mcp.js'),
    );
  }
});

test('watch instructions omit stale saved recipients so a reconnected client can bind again', async () => {
  const { PanelController } = await import('../src/extension/panel-controller.js');
  const f = fixture();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let copied = '';
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async (text: string) => {
          copied = text;
        },
      },
    },
  });
  try {
    const controller = new PanelController();
    Object.assign(controller.snapshot(), {
      projectId: f.project.id,
      projects: [f.project],
      recipientId: f.connection.id,
      agents: [],
    });
    await controller.copyWatchInstruction();
    assert.ok(
      !copied.includes(f.connection.id),
      'A stale selection must not pin a new process to the old ID',
    );
    controller.snapshot().agents = [f.connection];
    await controller.copyWatchInstruction();
    assert.ok(copied.includes(f.connection.id));
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original);
    else Reflect.deleteProperty(globalThis, 'navigator');
    f.close();
  }
});
