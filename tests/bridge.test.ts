import { fixtureDelivery } from './delivery-fixture.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/bridge/store.js';
import { Queue } from '../src/bridge/queue.js';
import { createApp } from '../src/bridge/server.js';
import type { Runner, RunnerHooks } from '../src/bridge/codex.js';
import type { Submission } from '../src/shared/contracts.js';
const origin = `chrome-extension://${'a'.repeat(32)}`;
const page = {
  url: 'http://127.0.0.1:5173/design',
  title: '测试',
  selector: '#send',
  label: '发送',
  tag: 'button',
  viewport: { width: 1200, height: 800 },
  rect: { x: 10, y: 10, width: 40, height: 40 },
  styles: { height: '40px' },
};
function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'pagepatch-test-')));
  const store = new Store(directory);
  const project = {
    id: randomUUID(),
    cwd: directory,
    name: '测试项目',
    origins: ['http://127.0.0.1:5173'],
  };
  store.config.projects.push(project);
  store.saveConfig();
  const input = (): Submission => ({
    id: randomUUID(),
    projectId: project.id,
    instruction: '调整按钮高度',
    selection: page,
  });
  return {
    directory,
    store,
    project,
    input,
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
test('HTTP pairing rejects hostile origins, wrong tokens, unpaired clients and arbitrary workspaces', async () => {
  const f = fixture();
  const queue = new Queue(f.store, () => ({ done: Promise.resolve(), cancel() {}, reply() {} }));
  const app = createApp(f.store, queue, 4318, fixtureDelivery);
  const request = (path: string, body?: unknown, extra: Record<string, string> = {}) =>
    app.request(`http://127.0.0.1:4318${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Host: '127.0.0.1:4318',
        Origin: origin,
        Authorization: `Bearer ${f.store.config.token}`,
        'Content-Type': 'application/json',
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  try {
    assert.equal((await request('/api/projects')).status, 403);
    assert.equal((await request('/api/pair', {}, { Origin: 'https://evil.test' })).status, 403);
    assert.equal((await request('/api/pair', {}, { Authorization: 'Bearer wrong' })).status, 401);
    assert.equal((await request('/api/pair', {}, { Host: 'evil.test:4318' })).status, 403);
    assert.equal((await request('/api/pair', {})).status, 200);
    assert.equal((await request('/api/projects')).status, 200);
    assert.equal(
      (
        await request('/api/projects', undefined, {
          Origin: '',
          'X-PagePatch-Client': 'a'.repeat(32),
        })
      ).status,
      200,
    );
    assert.equal((await request('/api/jobs', { ...f.input(), cwd: '/' })).status, 400);
    assert.equal(
      (
        await request('/api/jobs', {
          ...f.input(),
          selection: { ...page, url: 'https://unbound.test' },
        })
      ).status,
      400,
    );
    assert.equal((await request('/api/jobs', f.input())).status, 202);
    await tick();
  } finally {
    f.cleanup();
  }
});
test('queue deduplicates retries, serializes jobs, surfaces approvals, cancels and persists results', async () => {
  const f = fixture();
  const runs: { hooks: RunnerHooks; resolve: () => void }[] = [];
  const runner: Runner = (_p, _j, _t, hooks) => {
    let finish!: () => void;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    runs.push({ hooks, resolve: finish });
    return { done, cancel: finish, reply: () => hooks.approved() };
  };
  const q = new Queue(f.store, runner);
  try {
    const input = f.input();
    q.submit(input);
    q.submit(input);
    assert.equal(f.store.jobs.length, 1);
    assert.throws(() => q.submit({ ...input, instruction: '其他修改' }));
    const second = q.submit(f.input());
    assert.equal(second.startedAt, undefined);
    assert.equal(second.finishedAt, undefined);
    await tick();
    assert.equal(runs.length, 1);
    const first = f.store.jobs[0]!;
    assert.ok(first.startedAt);
    const startedAt = first.startedAt;
    runs[0]!.hooks.approval({
      id: 'approval',
      kind: 'command',
      title: '执行命令',
      details: 'check',
    });
    assert.equal(first.status, 'waiting');
    assert.throws(() => q.reply(first.id, 'stale', { decision: 'accept' }));
    q.reply(first.id, 'approval', { decision: 'decline' });
    assert.equal(first.status, 'running');
    assert.equal(first.startedAt, startedAt);
    runs[0]!.hooks.result('已修改并检查');
    runs[0]!.resolve();
    await tick();
    assert.equal(first.status, 'completed');
    assert.ok(first.finishedAt);
    assert.ok(Date.parse(first.finishedAt) >= Date.parse(startedAt));
    assert.equal(runs.length, 2);
    q.cancel(second.id);
    await tick();
    assert.equal(second.status, 'cancelled');
    assert.ok(second.startedAt);
    assert.ok(second.finishedAt);
    const reloaded = new Store(f.directory);
    assert.equal(reloaded.jobs[0]!.result, '已修改并检查');
    assert.equal(reloaded.jobs[0]!.startedAt, first.startedAt);
    assert.equal(reloaded.jobs[0]!.finishedAt, first.finishedAt);
  } finally {
    f.cleanup();
  }
});
test('restart never silently reruns an ambiguous task', () => {
  const f = fixture();
  try {
    f.store.jobs.push({
      ...f.input(),
      status: 'running',
      createdAt: '',
      updatedAt: '',
      events: [],
      result: '',
    });
    f.store.saveJobs();
    const recovered = new Store(f.directory);
    recovered.recover();
    assert.equal(recovered.jobs[0]!.status, 'interrupted');
  } finally {
    f.cleanup();
  }
});
