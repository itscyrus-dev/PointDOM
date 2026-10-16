import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/bridge/server.js';
import { Store } from '../src/bridge/store.js';
import { Queue } from '../src/bridge/queue.js';
import { PanelController } from '../src/extension/panel-controller.js';
import type { Job } from '../src/shared/contracts.js';

const projectA = randomUUID();
const projectB = randomUUID();
const originA = 'http://localhost:3000';
const originB = 'http://localhost:5173';
function job(projectId: string, instruction: string): Job {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    projectId,
    instruction,
    executor: 'mcp',
    status: 'completed',
    createdAt: now,
    updatedAt: now,
    result: '',
    events: [],
    selection: {
      url: `${projectId === projectA ? originA : originB}/`,
      title: 'Fixture',
      label: 'Fixture',
      selector: '#title',
      tag: 'h1',
      styles: {},
      viewport: { width: 1000, height: 800 },
      rect: { x: 0, y: 0, width: 100, height: 30 },
    },
  };
}

test('project history filters before the latest-100 limit and preserves all persisted records', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pointdom-history-'));
  try {
    const store = new Store(directory);
    const empty = randomUUID();
    store.config.projects.push(
      { id: projectA, name: 'A', cwd: directory, origins: [originA] },
      { id: projectB, name: 'B', cwd: directory, origins: [originB] },
      { id: empty, name: 'Empty', cwd: directory, origins: ['http://localhost:4000'] },
    );
    store.config.clients.push(`chrome-extension://${'a'.repeat(32)}`);
    store.jobs.push(job(projectA, 'A-only request'));
    for (let i = 0; i < 105; i++) store.jobs.push(job(projectB, `B request ${i}`));
    store.saveJobs();
    const app = createApp(store, new Queue(store), 4318);
    const read = (query: string, authenticated = true) =>
      app.request(`http://127.0.0.1:4318/api/jobs${query}`, {
        headers: {
          Host: '127.0.0.1:4318',
          'X-PagePatch-Client': 'a'.repeat(32),
          Authorization: authenticated ? `Bearer ${store.config.token}` : 'Bearer invalid',
        },
      });
    const a = await read(`?projectId=${projectA}`);
    assert.equal(a.status, 200);
    assert.deepEqual(
      (await a.json()).jobs.map((entry: Job) => entry.instruction),
      ['A-only request'],
    );
    const b = (await (await read(`?projectId=${projectB}`)).json()).jobs as Job[];
    assert.equal(b.length, 100);
    assert.ok(b.every((entry) => entry.projectId === projectB));
    assert.equal(b[0]?.instruction, 'B request 104');
    assert.deepEqual((await (await read(`?projectId=${empty}`)).json()).jobs, []);
    assert.equal((await read('?projectId=invalid')).status, 400);
    assert.equal((await read(`?projectId=${randomUUID()}`)).status, 404);
    assert.equal((await read(`?projectId=${projectA}`, false)).status, 401);
    assert.equal((await (await read('')).json()).jobs.length, 100); // Legacy clients remain compatible.
    assert.equal(new Store(directory).jobs.length, 106);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

async function controllerFixture() {
  let tab = { id: 1, url: `${originA}/` };
  const tabs = new Set<() => void>();
  const event = { addListener() {}, removeListener() {} };
  const originals = new Map(
    ['chrome', 'window', 'document', 'fetch'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const jobs = [job(projectA, 'A-only request'), job(projectB, 'B-only request')];
  const requests: string[] = [];
  let hold = false;
  let release: (() => void) | undefined;
  Object.assign(globalThis, {
    chrome: {
      runtime: {
        id: 'fixture-extension',
        onMessage: event,
        sendMessage: async () => ({ ok: true }),
      },
      storage: {
        local: { get: async () => ({ bridgeToken: 'fixture-token' }), set: async () => {} },
        onChanged: event,
      },
      tabs: {
        query: async () => [tab],
        onUpdated: event,
        onActivated: {
          addListener: (fn: () => void) => tabs.add(fn),
          removeListener: (fn: () => void) => tabs.delete(fn),
        },
      },
      commands: { getAll: async () => [] },
    },
    window: { addEventListener() {}, removeEventListener() {} },
    document: { hidden: true, addEventListener() {}, removeEventListener() {} },
    fetch: async (input: string) => {
      const url = new URL(input);
      if (url.pathname === '/api/pair') return Response.json({ defaultExecutor: 'mcp' });
      if (url.pathname === '/api/projects')
        return Response.json({
          agentSettings: { defaultExecutor: 'codex' },
          projects: [
            { id: projectA, name: 'A', cwd: '/fixture/a', origins: [originA] },
            { id: projectB, name: 'B', cwd: '/fixture/b', origins: [originB] },
          ],
        });
      if (url.pathname === '/api/agents') return Response.json({ agents: [] });
      if (url.pathname === '/api/clis') return Response.json({ clis: [] });
      requests.push(url.search);
      if (hold) {
        hold = false;
        await new Promise<void>((done) => {
          release = done;
        });
      }
      // A pre-upgrade bridge can still return all projects; the client must reject foreign records.
      return Response.json({ jobs });
    },
  });
  const controller = new PanelController();
  await controller.start();
  return {
    controller,
    requests,
    holdNext() {
      hold = true;
    },
    async waitForHeld() {
      while (!release) await new Promise<void>((done) => setImmediate(done));
    },
    release() {
      release?.();
    },
    async switchToB() {
      tab = { id: 2, url: `${originB}/` };
      tabs.forEach((fn) => fn());
      await new Promise<void>((done) => setImmediate(done));
    },
    dispose() {
      controller.stop();
      release?.();
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

test('panel history is scoped even with an older bridge returning records from every project', async () => {
  const f = await controllerFixture();
  try {
    assert.equal(f.controller.snapshot().projectId, projectA);
    assert.deepEqual(
      f.controller.snapshot().jobs.map((entry) => entry.instruction),
      ['A-only request'],
    );
    assert.ok(f.requests.every((query) => query === `?projectId=${projectA}`));
  } finally {
    f.dispose();
  }
});

test('a delayed history response cannot repopulate another project after a tab switch', async () => {
  const f = await controllerFixture();
  try {
    f.holdNext();
    const pending = f.controller.refresh();
    await f.waitForHeld();
    await f.switchToB();
    assert.equal(f.controller.snapshot().projectId, projectB);
    assert.ok(f.controller.snapshot().jobs.every((entry) => entry.projectId === projectB));
    f.release();
    await pending;
    await f.controller.refresh();
    assert.deepEqual(
      f.controller.snapshot().jobs.map((entry) => entry.instruction),
      ['B-only request'],
    );
  } finally {
    f.dispose();
  }
});
