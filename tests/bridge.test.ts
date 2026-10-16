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
  const queue = new Queue(f.store);
  const recipient = queue.agents.register({
    projectId: f.store.config.projects[0]!.id,
    claim: randomUUID(),
    client: { name: 'Fixture', version: '1' },
  });
  const app = createApp(f.store, queue, 4318);
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
          recipientId: recipient.id,
          selection: { ...page, url: 'https://unbound.test' },
        })
      ).status,
      400,
    );
    assert.equal(
      (await request('/api/jobs', { ...f.input(), recipientId: recipient.id })).status,
      202,
    );
    await tick();
  } finally {
    f.cleanup();
  }
});
test('MCP inbox deduplicates, validates project origins, preserves cancellation and never starts execution', async () => {
  const f = fixture();
  try {
    const q = new Queue(f.store);
    const request = f.input();
    const first = q.submit(request);
    assert.equal(q.submit(request), first);
    assert.throws(() => q.submit({ ...request, instruction: 'Changed' }), /任务 ID/);
    assert.throws(
      () => q.submit({ ...f.input(), selection: { ...page, url: 'https://unregistered.test' } }),
      /未绑定/,
    );
    const second = q.submit(f.input());
    q.wake();
    await tick();
    for (const job of [first, second]) {
      assert.equal(job.executor, 'mcp');
      assert.equal(job.status, 'queued');
      assert.equal(job.startedAt, undefined);
      assert.equal(job.result, '');
    }
    q.cancel(second.id);
    q.cancel(second.id);
    assert.equal(new Store(f.directory).jobs[1]?.status, 'cancelled');
    q.stop();
    assert.throws(() => q.submit(f.input()), /stopping/);
    assert.equal(first.status, 'queued');
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
