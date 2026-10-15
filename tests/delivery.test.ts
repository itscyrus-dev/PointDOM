import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/bridge/store.js';
import { Queue } from '../src/bridge/queue.js';
import { DeliveryRouter, hasCli, type DeliveryActions } from '../src/bridge/delivery.js';
import type { Submission } from '../src/shared/contracts.js';

async function wait(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('delivery fixture did not settle');
}
function fixture(actions: DeliveryActions, fail = false) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'pointdom-delivery-')));
  const store = new Store(join(directory, 'state'));
  const id = randomUUID();
  store.config.projects.push({
    id,
    name: 'Fixture',
    cwd: directory,
    origins: ['http://localhost:5173'],
  });
  store.saveConfig();
  let runs = 0;
  const queue = new Queue(store, (_project, _job, _thread, hooks) => {
    runs++;
    return {
      done: fail
        ? Promise.reject(new Error('fixture_cli_failed'))
        : Promise.resolve().then(() => hooks.result('Fixture changes verified.')),
      cancel() {},
      reply() {},
    };
  });
  const router = new DeliveryRouter(store, queue, actions);
  const input: Submission = {
    id: randomUUID(),
    executor: 'opencode',
    projectId: id,
    instruction: '调整按钮',
    selection: {
      url: 'http://localhost:5173/',
      title: 'UNTRUSTED_PAGE_TEXT',
      label: 'Button',
      selector: 'button',
      tag: 'button',
      viewport: { width: 100, height: 100 },
      rect: { x: 0, y: 0, width: 10, height: 10 },
      styles: {},
    },
  };
  return {
    directory,
    store,
    queue,
    router,
    input,
    runs: () => runs,
    close: () => rmSync(directory, { recursive: true, force: true }),
  };
}

test('CLI availability routes automatically, ignores retired overrides and never auto-commits', async () => {
  let pasted = 0;
  const f = fixture({
    hasCli: () => true,
    paste: async () => {
      pasted++;
      return { state: 'pasted' };
    },
  });
  try {
    const job = f.router.submit({
      ...f.input,
      executor: 'codex',
      execution: {
        model: 'retired',
        effort: 'high',
        serviceTier: 'fast',
        approvalPolicy: 'never',
        autoCommit: true,
      },
    });
    await wait(() => job.status === 'completed');
    assert.equal(job.executor, 'codex');
    assert.equal(job.delivery?.state, 'cli');
    assert.equal(job.execution, undefined);
    assert.equal(f.runs(), 1);
    assert.equal(pasted, 0);
    assert.notEqual(job.commit?.status, 'committed');
  } finally {
    f.close();
  }
});

test('missing CLI fills one client instruction, deduplicates lost responses and stays awaiting claim', async () => {
  let available = false;
  const pasted: string[] = [];
  const f = fixture({
    hasCli: () => available,
    paste: async (target, text) => {
      assert.equal(target, 'opencode');
      pasted.push(text);
      return { state: 'pasted' };
    },
  });
  try {
    const job = f.router.submit(f.input);
    assert.equal(f.router.submit(f.input), job);
    await wait(() => job.delivery?.state === 'pasted');
    assert.equal(job.status, 'queued');
    assert.equal(job.executor, 'mcp');
    assert.equal(job.result, '');
    assert.equal(f.runs(), 0);
    assert.equal(pasted.length, 1);
    assert.match(pasted[0]!, new RegExp(job.id));
    assert.match(pasted[0]!, /claim_task before editing/);
    assert.doesNotMatch(pasted[0]!, /UNTRUSTED_PAGE_TEXT/);
    available = true;
    assert.equal(f.router.submit(f.input), job);
    assert.throws(
      () => f.router.submit({ ...f.input, instruction: 'different request' }),
      /任务 ID 已用于不同请求/,
    );
    const restored = new Store(f.store.directory);
    restored.recover();
    const restarted = new DeliveryRouter(restored, new Queue(restored), {
      hasCli: () => true,
      paste: async () => {
        throw new Error('must not replay');
      },
    });
    assert.equal(restarted.submit(f.input).delivery?.state, 'pasted');
    assert.equal(pasted.length, 1);
  } finally {
    f.close();
  }
});

test('a failed CLI never falls back and risks executing the paid task twice', async () => {
  let pasted = 0;
  const f = fixture(
    {
      hasCli: () => true,
      paste: async () => {
        pasted++;
        return { state: 'pasted' };
      },
    },
    true,
  );
  try {
    const job = f.router.submit(f.input);
    await wait(() => job.status === 'failed');
    assert.equal(pasted, 0);
    assert.equal(job.error, 'fixture_cli_failed');
  } finally {
    f.close();
  }
});

test('handoffs serialize, cancellation prevents a queued paste, and restart does not replay an uncertain handoff', async () => {
  let release = () => {};
  let count = 0;
  const f = fixture({
    hasCli: () => false,
    paste: async () => {
      count++;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { state: 'pasted' };
    },
  });
  try {
    const first = f.router.submit(f.input);
    const second = f.router.submit({ ...f.input, id: randomUUID() });
    await wait(() => count === 1);
    const restored = new Store(f.store.directory);
    restored.recover();
    assert.equal(restored.jobs[0]?.delivery?.state, 'uncertain');
    assert.equal(restored.jobs[0]?.status, 'queued');
    f.router.cancel(second.id);
    f.queue.cancel(second.id);
    release();
    await wait(() => first.delivery?.state === 'pasted');
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(count, 1);
    assert.equal(second.status, 'cancelled');
    assert.equal(second.delivery?.state, 'uncertain');
  } finally {
    f.close();
  }
});

test('copy-only failures remain visible and an explicit retry can fill the client without running the task', async () => {
  let calls = 0;
  const f = fixture({
    hasCli: () => false,
    paste: async () => {
      calls++;
      return { state: calls === 1 ? 'copied' : 'pasted', detail: 'Fixture delivery receipt.' };
    },
  });
  try {
    const job = f.router.submit(f.input);
    await wait(() => job.delivery?.state === 'copied');
    await new Promise<void>((resolve) => setImmediate(resolve));
    f.router.retry(job.id);
    await wait(() => job.delivery?.state === 'pasted');
    assert.equal(calls, 2);
    assert.equal(f.runs(), 0);
    assert.equal(job.status, 'queued');
    assert.throws(
      () =>
        f.router.submit({
          ...f.input,
          id: randomUUID(),
          selection: { ...f.input.selection, url: 'https://unregistered.example/' },
        }),
      /当前网页未绑定该项目/,
    );
    assert.equal(calls, 2);
  } finally {
    f.close();
  }
});

test('CLI detection accepts only executable files on trusted absolute paths', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pointdom-cli-'));
  const previous = process.env.PAGEPATCH_OPENCODE_BIN;
  try {
    const binary = join(directory, 'opencode');
    process.env.PAGEPATCH_OPENCODE_BIN = binary;
    assert.equal(hasCli('opencode'), false);
    writeFileSync(binary, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
    assert.equal(hasCli('opencode'), true);
    const folder = join(directory, 'folder');
    mkdirSync(folder);
    process.env.PAGEPATCH_OPENCODE_BIN = folder;
    assert.equal(hasCli('opencode'), false);
    assert.equal(hasCli('mcp'), false);
  } finally {
    if (previous === undefined) delete process.env.PAGEPATCH_OPENCODE_BIN;
    else process.env.PAGEPATCH_OPENCODE_BIN = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
