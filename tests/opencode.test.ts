import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runOpenCode } from '../src/bridge/opencode.js';
import { Store } from '../src/bridge/store.js';
import { Queue } from '../src/bridge/queue.js';
import type { Job } from '../src/shared/contracts.js';
const wait = async (predicate: () => boolean) => {
  for (let i = 0; i < 150; i++) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error('fixture timed out');
};
test('OpenCode CLI executes only in registered projects, waits for permissions, cancels, reports errors and survives restart', async () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'pointdom-opencode-')));
  const saved = process.env.PAGEPATCH_OPENCODE_BIN;
  const mode = process.env.FIXTURE_MODE;
  try {
    const binary = join(directory, 'opencode');
    writeFileSync(
      binary,
      `#!${process.execPath}\n${readFileSync(resolve('tests/fixtures/opencode.mjs'), 'utf8')}`,
      { mode: 0o700 },
    );
    process.env.PAGEPATCH_OPENCODE_BIN = binary;
    const store = new Store(join(directory, 'state'));
    store.config.projects.push({
      id: randomUUID(),
      name: 'fixture',
      cwd: directory,
      origins: ['http://localhost:5173'],
      openCodeModel: 'fixture/model',
    });
    const queue = new Queue(store, runOpenCode);
    const submit = (project = store.config.projects[0]!) =>
      queue.submit({
        executor: 'opencode',
        id: randomUUID(),
        projectId: project.id,
        instruction: '调整高度',
        selection: {
          url: 'http://localhost:5173/',
          title: 'fixture',
          selector: 'button',
          label: 'untrusted',
          tag: 'button',
          viewport: { width: 100, height: 100 },
          rect: { x: 0, y: 0, width: 10, height: 10 },
          styles: {},
        },
      });
    writeFileSync(join(directory, 'button.css'), 'button { height: 32px; }');
    const job = submit();
    assert.equal(queue.submit(job).id, job.id);
    await wait(() => job.status === 'waiting');
    assert.equal(readFileSync(join(directory, 'button.css'), 'utf8'), 'button { height: 32px; }');
    queue.reply(job.id, job.approval!.id, { decision: 'accept' });
    await wait(() => job.status === 'completed');
    assert.match(job.result, /button.css/);
    assert.equal(readFileSync(join(directory, 'button.css'), 'utf8'), 'button { height: 40px; }');
    const otherDirectory = join(directory, 'other-project');
    mkdirSync(otherDirectory);
    writeFileSync(join(otherDirectory, 'button.css'), 'button { height: 32px; }');
    const otherProject = {
      id: randomUUID(),
      name: 'other',
      cwd: otherDirectory,
      origins: ['http://localhost:5173'],
    };
    store.config.projects.push(otherProject);
    const other = submit(otherProject);
    await wait(() => other.status === 'waiting');
    queue.reply(other.id, other.approval!.id, { decision: 'accept' });
    await wait(() => other.status === 'completed');
    assert.match(readFileSync(join(otherDirectory, 'button.css'), 'utf8'), /40px/);
    assert.match(readFileSync(join(directory, 'button.css'), 'utf8'), /40px/);
    const cancel = submit();
    await wait(() => cancel.status === 'waiting');
    queue.cancel(cancel.id);
    await wait(() => cancel.status === 'cancelled');
    assert.throws(() => queue.reply(cancel.id, 'per_fixture', { decision: 'accept' }));
    const next = submit();
    await wait(() => next.status === 'waiting');
    queue.reply(next.id, next.approval!.id, { decision: 'decline' });
    await wait(() => next.status === 'completed');
    process.env.FIXTURE_MODE = 'question';
    const question = submit();
    await wait(() => question.status === 'waiting');
    assert.equal(question.approval!.kind, 'questions');
    queue.reply(question.id, question.approval!.id, { answers: { '0': '40px' } });
    await wait(() => question.status === 'completed');
    process.env.FIXTURE_MODE = 'error';
    const error = submit();
    await wait(() => error.status === 'failed');
    assert.equal(error.error!.includes('fake-key'), false);
    process.env.FIXTURE_MODE = 'exit';
    const exit = submit();
    await wait(() => exit.status === 'failed');
    assert.match(exit.error!, /OpenCode/);
    store.jobs.push({ ...job, id: randomUUID(), status: 'running' } as Job);
    store.saveJobs();
    const reload = new Store(store.directory);
    reload.recover();
    assert.equal(reload.jobs.at(-1)!.status, 'interrupted');
    assert.equal(reload.jobs[0]!.status, 'completed');
  } finally {
    if (saved === undefined) delete process.env.PAGEPATCH_OPENCODE_BIN;
    else process.env.PAGEPATCH_OPENCODE_BIN = saved;
    if (mode === undefined) delete process.env.FIXTURE_MODE;
    else process.env.FIXTURE_MODE = mode;
    rmSync(directory, { recursive: true, force: true });
  }
});
