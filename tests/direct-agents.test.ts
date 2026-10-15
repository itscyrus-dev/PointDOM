import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  realpathSync,
  writeFileSync,
  readFileSync,
  rmSync,
  mkdirSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/bridge/store.js';
import { Queue } from '../src/bridge/queue.js';
import { insideProject } from '../src/bridge/acp.js';
import type { Executor, Project } from '../src/shared/contracts.js';
import { claudeRunner } from '../src/bridge/claude.js';

async function wait(predicate: () => boolean) {
  for (let i = 0; i < 300; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('direct agent fixture timed out');
}

test('OpenCode v2, Claude SDK and Trae route to real local transports, approve once, reject, cancel and fail honestly', async () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'pointdom-direct-')));
  const keys = [
    'PAGEPATCH_OPENCODE_BIN',
    'PAGEPATCH_CLAUDE_BIN',
    'PAGEPATCH_TRAE_BIN',
    'POINTDOM_FIXTURE_CASE',
  ];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const binary = join(directory, 'agent-fixture');
  writeFileSync(
    binary,
    `#!${process.execPath}\n${readFileSync(resolve('tests/fixtures/direct-agent.mjs'), 'utf8')}`,
    { mode: 0o700 },
  );
  for (const key of keys.slice(0, 3)) process.env[key] = binary;
  const store = new Store(join(directory, 'state'));
  const cwd = join(directory, 'project');
  mkdirSync(cwd);
  const project: Project = {
    id: randomUUID(),
    name: 'fixture',
    cwd,
    origins: ['http://localhost:5173'],
  };
  store.config.projects.push(project);
  const queue = new Queue(store);
  const submit = (executor: Executor) =>
    queue.submit({
      executor,
      id: randomUUID(),
      projectId: project.id,
      instruction: '调整按钮高度',
      selection: {
        url: 'http://localhost:5173/',
        title: 'fixture',
        selector: 'button',
        label: '发送',
        tag: 'button',
        viewport: { width: 100, height: 100 },
        rect: { x: 0, y: 0, width: 10, height: 10 },
        styles: {},
      },
    });
  const reset = () => writeFileSync(join(cwd, 'button.css'), 'button { height: 32px; }');
  const contents = () => readFileSync(join(cwd, 'button.css'), 'utf8');
  try {
    for (const executor of ['opencode', 'claude', 'trae'] as const) {
      process.env.POINTDOM_FIXTURE_CASE = 'edit';
      reset();
      const job = submit(executor);
      assert.equal(queue.submit(job).id, job.id);
      await wait(() => job.status === 'waiting' || job.status === 'failed');
      assert.equal(job.status, 'waiting', job.error);
      assert.match(contents(), /32px/);
      queue.reply(job.id, job.approval!.id, { decision: 'accept' });
      await wait(() => job.status === 'completed' || job.status === 'failed');
      assert.equal(job.status, 'completed', job.error);
      assert.match(contents(), /40px/);
      assert.match(job.result, /button.css/);
      if (executor !== 'claude') {
        project.permissions = { confirmation: 'reduced', codexNetwork: false };
        process.env.POINTDOM_FIXTURE_CASE = 'reduced';
        const reduced = submit(executor);
        await wait(
          () =>
            reduced.status === 'completed' ||
            reduced.status === 'waiting' ||
            reduced.status === 'failed',
        );
        assert.equal(reduced.status, 'completed', reduced.error);
        for (const scenario of ['command', 'masked-command', 'no-path']) {
          process.env.POINTDOM_FIXTURE_CASE = scenario;
          const stillAsks = submit(executor);
          await wait(() => stillAsks.status === 'waiting' || stillAsks.status === 'failed');
          assert.equal(stillAsks.status, 'waiting', stillAsks.error);
          queue.reply(stillAsks.id, stillAsks.approval!.id, { decision: 'decline' });
          await wait(() => stillAsks.status === 'completed');
        }
        process.env.POINTDOM_FIXTURE_CASE = 'outside';
        reset();
        const outside = submit(executor);
        await wait(
          () =>
            outside.status === 'completed' ||
            outside.status === 'waiting' ||
            outside.status === 'failed',
        );
        assert.equal(outside.status, 'completed', outside.error);
        assert.match(contents(), /32px/);
        delete project.permissions;
        process.env.POINTDOM_FIXTURE_CASE = 'edit';
      }
      assert.equal(
        store.config.threads[project.id],
        undefined,
        'non-Codex sessions must not overwrite Codex thread IDs',
      );
      assert.throws(
        () => queue.submit({ ...job, id: randomUUID(), execution: { approvalPolicy: 'never' } }),
        /Codex/,
      );

      reset();
      const denied = submit(executor);
      await wait(() => denied.status === 'waiting');
      queue.reply(denied.id, denied.approval!.id, { decision: 'decline' });
      await wait(() => denied.status === 'completed');
      assert.match(contents(), /32px/);
      assert.match(denied.result, /拒绝/);

      const cancelled = submit(executor);
      await wait(() => cancelled.status === 'waiting');
      const cancelledApproval = cancelled.approval!.id;
      queue.cancel(cancelled.id);
      assert.throws(() => queue.reply(cancelled.id, cancelledApproval, { decision: 'accept' }));
      await wait(() => cancelled.status === 'cancelled');
      assert.match(contents(), /32px/);

      process.env.POINTDOM_FIXTURE_CASE = 'error';
      const failed = submit(executor);
      await wait(() => failed.status === 'waiting');
      queue.reply(failed.id, failed.approval!.id, { decision: 'decline' });
      await wait(() => failed.status === 'failed');
      assert.equal(failed.error?.includes('fake-key'), false);

      if (executor === 'claude') {
        process.env.POINTDOM_FIXTURE_CASE = 'question';
        const question = submit(executor);
        await wait(() => question.status === 'waiting');
        assert.equal(question.approval?.kind, 'questions');
        queue.reply(question.id, question.approval!.id, { answers: { '0': '40px' } });
        await wait(() => question.status === 'completed');
        reset();
        const declinedQuestion = submit(executor);
        await wait(() => declinedQuestion.status === 'waiting');
        queue.reply(declinedQuestion.id, declinedQuestion.approval!.id, {
          decision: 'decline',
          answers: { '0': '40px' },
        });
        await wait(() => declinedQuestion.status === 'completed');
        assert.match(contents(), /32px/);
      } else {
        process.env.POINTDOM_FIXTURE_CASE = 'outside';
        reset();
        const outside = submit(executor);
        await wait(() => outside.status === 'completed');
        assert.match(contents(), /32px/);
        process.env.POINTDOM_FIXTURE_CASE = 'no-result';
        const empty = submit(executor);
        await wait(() => empty.status === 'failed');
        assert.match(empty.error!, /未返回执行结果/);
        process.env.POINTDOM_FIXTURE_CASE = 'protocol';
        const protocol = submit(executor);
        await wait(() => protocol.status === 'failed');
        assert.match(protocol.error!, /协议版本/);
      }
      process.env.POINTDOM_FIXTURE_CASE = 'exit';
      const exited = submit(executor);
      await wait(() => exited.status === 'failed');
      assert.ok(exited.error);
      const key =
        executor === 'opencode'
          ? 'PAGEPATCH_OPENCODE_BIN'
          : executor === 'claude'
            ? 'PAGEPATCH_CLAUDE_BIN'
            : 'PAGEPATCH_TRAE_BIN';
      process.env[key] = join(directory, 'missing');
      const missing = submit(executor);
      await wait(() => missing.status === 'failed');
      assert.ok(missing.error);
      process.env[key] = binary;
    }
    store.saveJobs();
    const restarted = new Store(store.directory);
    restarted.recover();
    assert.deepEqual(
      restarted.jobs.map((j) => j.executor),
      store.jobs.map((j) => j.executor),
    );
    assert.deepEqual(
      restarted.jobs.map((j) => j.status),
      store.jobs.map((j) => j.status),
    );
  } finally {
    queue.stop();
    for (const key of keys) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Claude project permissions select native edit mode and sandboxed commands without bypassing isolation', async () => {
  const saved = process.env.PAGEPATCH_CLAUDE_BIN;
  process.env.PAGEPATCH_CLAUDE_BIN = process.execPath;
  try {
    for (const reduced of [false, true]) {
      const captured: {
        mode?: string;
        enabled?: boolean;
        auto?: boolean;
        unsandboxed?: boolean;
      }[] = [];
      const runner = claudeRunner(({ options }) => {
        captured.push({
          mode: options?.permissionMode,
          enabled: options?.sandbox?.enabled,
          auto: options?.sandbox?.autoAllowBashIfSandboxed,
          unsandboxed: options?.sandbox?.allowUnsandboxedCommands,
        });
        throw new Error('Fixture inspected native options');
      });
      const project: Project = {
        id: randomUUID(),
        name: 'fixture',
        cwd: process.cwd(),
        origins: [],
      };
      const job = {
        instruction: 'test',
        selection: { label: 'fixture' },
        permissions: { confirmation: reduced ? 'reduced' : 'default', codexNetwork: false },
      } as import('../src/shared/contracts.js').Job;
      const run = runner(project, job, undefined, {
        event() {},
        result() {},
        thread() {},
        approval() {},
        approved() {},
      });
      await assert.rejects(run.done, /Claude Code 连接失败/);
      assert.deepEqual(captured, [
        {
          mode: reduced ? 'acceptEdits' : 'default',
          enabled: true,
          auto: reduced,
          unsandboxed: false,
        },
      ]);
    }
  } finally {
    if (saved === undefined) delete process.env.PAGEPATCH_CLAUDE_BIN;
    else process.env.PAGEPATCH_CLAUDE_BIN = saved;
  }
});

test('project boundary checks reject traversal, sibling prefixes and symlink escapes for existing and new files', () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'pointdom-scope-')));
  try {
    const cwd = join(directory, 'project');
    mkdirSync(cwd);
    mkdirSync(join(directory, 'project-other'));
    symlinkSync(join(directory, 'project-other'), join(cwd, 'escape'));
    assert.equal(insideProject(cwd, 'new/sub/file.ts'), true);
    assert.equal(insideProject(cwd, '../project-other/file.ts'), false);
    assert.equal(insideProject(cwd, 'escape/new/file.ts'), false);
    assert.equal(insideProject(cwd, join(directory, 'project-other')), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
