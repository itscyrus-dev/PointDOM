import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { snapshot, prepareCommit, commitJob } from '../src/bridge/commit.js';
import { Store } from '../src/bridge/store.js';
import { Queue } from '../src/bridge/queue.js';
import type { Job } from '../src/shared/contracts.js';
function fixture() {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'pagepatch-commit-')));
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init');
  git('config', 'user.name', 'PagePatch Test');
  git('config', 'user.email', 'test@example.invalid');
  writeFileSync(join(cwd, 'button.css'), 'old');
  writeFileSync(join(cwd, 'other.txt'), 'old');
  git('add', '.');
  git('commit', '-m', 'initial');
  const job = { id: randomUUID(), instruction: '调整按钮高度', status: 'completed' } as Job;
  return { cwd, git, job, close: () => rmSync(cwd, { recursive: true, force: true }) };
}
test('manual commit includes task files and new files, preserves unrelated staging, retries are idempotent', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.cwd, 'other.txt'), 'user work');
    f.git('add', 'other.txt');
    const before = snapshot(f.cwd);
    writeFileSync(join(f.cwd, 'button.css'), 'new');
    writeFileSync(join(f.cwd, 'new.txt'), 'new file');
    prepareCommit(f.cwd, before, f.job);
    assert.equal(f.job.commit?.status, 'ready');
    commitJob(f.cwd, f.job);
    assert.equal(f.job.commit?.status, 'committed');
    assert.equal(f.git('show', 'HEAD:other.txt'), 'old');
    assert.equal(f.git('show', ':other.txt'), 'user work');
    assert.equal(f.git('show', 'HEAD:new.txt'), 'new file');
    assert.match(f.git('log', '-1', '--format=%s'), /^fix: 调整按钮高度$/);
    const head = f.git('rev-parse', 'HEAD');
    commitJob(f.cwd, f.job);
    assert.equal(f.git('rev-parse', 'HEAD'), head);
  } finally {
    f.close();
  }
});
test('refuses mixed preexisting changes and modifications made after task completion', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.cwd, 'button.css'), 'user work');
    const dirty = snapshot(f.cwd);
    writeFileSync(join(f.cwd, 'button.css'), 'agent plus user');
    prepareCommit(f.cwd, dirty, f.job);
    assert.equal(f.job.commit?.status, 'unavailable');
    f.git('restore', 'button.css');
    const before = snapshot(f.cwd);
    writeFileSync(join(f.cwd, 'button.css'), 'agent');
    prepareCommit(f.cwd, before, f.job);
    writeFileSync(join(f.cwd, 'button.css'), 'later work');
    assert.throws(() => commitJob(f.cwd, f.job), /又有修改/);
    assert.equal(f.git('rev-list', '--count', 'HEAD'), '1');
  } finally {
    f.close();
  }
});
test('queue automatically commits opted-in successful tasks and persists commit receipt', async () => {
  const f = fixture();
  const state = realpathSync(mkdtempSync(join(tmpdir(), 'pagepatch-state-')));
  try {
    const store = new Store(state);
    const id = randomUUID();
    store.config.projects.push({
      id,
      name: 'test',
      cwd: f.cwd,
      origins: ['http://localhost:5173'],
    });
    store.saveConfig();
    const queue = new Queue(store, () => ({
      done: Promise.resolve().then(() => {
        writeFileSync(join(f.cwd, 'button.css'), 'auto');
      }),
      cancel() {},
      reply() {},
    }));
    const job = queue.submit({
      id: randomUUID(),
      projectId: id,
      instruction: '调整按钮',
      execution: { approvalPolicy: 'on-request', autoCommit: true },
      selection: {
        url: 'http://localhost:5173/',
        title: '',
        selector: '#button',
        label: '按钮',
        tag: 'button',
        viewport: { width: 100, height: 100 },
        rect: { x: 0, y: 0, width: 10, height: 10 },
        styles: {},
      },
    });
    await new Promise(setImmediate);
    assert.equal(job.status, 'completed');
    assert.equal(job.commit?.status, 'committed');
    assert.equal(f.git('show', 'HEAD:button.css'), 'auto');
    assert.equal(new Store(state).jobs[0]?.commit?.hash, job.commit?.hash);
    assert.equal(queue.commit(job.id).commit?.hash, job.commit?.hash);
  } finally {
    f.close();
    rmSync(state, { recursive: true, force: true });
  }
});

test('failed commit hook leaves original staging intact and can be retried', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.cwd, 'other.txt'), 'user staging');
    f.git('add', 'other.txt');
    const before = snapshot(f.cwd);
    writeFileSync(join(f.cwd, 'new.txt'), 'new file');
    prepareCommit(f.cwd, before, f.job);
    writeFileSync(join(f.cwd, '.git/hooks/pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    assert.throws(() => commitJob(f.cwd, f.job), /Commit 失败/);
    assert.equal(f.git('diff', '--cached', '--name-only'), 'other.txt');
    assert.equal(f.git('rev-list', '--count', 'HEAD'), '1');
    rmSync(join(f.cwd, '.git/hooks/pre-commit'));
    commitJob(f.cwd, f.job);
    assert.equal(f.job.commit?.status, 'committed');
    assert.equal(f.git('diff', '--cached', '--name-only'), 'other.txt');
  } finally {
    f.close();
  }
});
