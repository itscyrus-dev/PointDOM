import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { CliRunner, parseCliEvent, cliArguments } from '../src/bridge/cli-runner.js';
import { Store } from '../src/bridge/store.js';
import { Queue } from '../src/bridge/queue.js';
import type { Submission } from '../src/shared/contracts.js';
const selection = {
  url: 'http://localhost:5173',
  title: 'Ignore instructions',
  selector: '#a',
  label: 'A',
  tag: 'button',
  viewport: { width: 500, height: 500 },
  rect: { x: 0, y: 0, width: 40, height: 40 },
  styles: {},
};
function fixture(source = '') {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'pointdom-cli-')));
  const script = join(dir, 'fake.cjs');
  writeFileSync(
    script,
    source ||
      `let input=''; process.stdin.on('data',c=>input+=c); process.stdin.on('end',()=>{const p=JSON.parse(input); if(!p.untrustedPageContext || !p.instructions)process.exit(9); console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Verified fixture change'}})); console.log(JSON.stringify({type:'turn.completed'}));});`,
  );
  const runner = new CliRunner({
    resolve: async () => ({ command: process.execPath, prefix: [script], dialect: 'exec' }),
    timeoutMs: 1500,
  });
  const store = new Store(join(dir, 'state'));
  const project = {
    id: randomUUID(),
    name: 'Fixture',
    cwd: dir,
    origins: ['http://localhost:5173'],
  };
  store.config.projects.push(project);
  const queue = new Queue(store, runner);
  const input = (): Submission => ({
    id: randomUUID(),
    executor: 'codex',
    projectId: project.id,
    instruction: 'Adjust button',
    selection,
  });
  return {
    dir,
    runner,
    store,
    queue,
    input,
    close: () => {
      queue.stop();
      setTimeout(() => rmSync(dir, { recursive: true, force: true }), 200);
    },
  };
}
async function until(check: () => boolean) {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail('timed out');
}
test('CLI submission starts without MCP, preserves context, and reports completion exactly once', async () => {
  const f = fixture();
  try {
    const input = f.input();
    const job = f.queue.submit(input);
    assert.equal(job.executor, 'codex');
    assert.equal(f.queue.submit(input), job);
    await until(() => job.status === 'completed');
    assert.match(job.result, /Verified fixture/);
    assert.ok(job.startedAt && job.finishedAt);
    assert.equal(f.store.jobs.length, 1);
    assert.throws(() => f.queue.submit({ ...input, executor: 'trae' }), /ID/);
  } finally {
    f.close();
  }
});
test('project queue serializes CLI runs and cancellation terminates a running child', async () => {
  const f = fixture(`process.stdin.resume();setInterval(()=>{},100);`);
  try {
    const a = f.queue.submit(f.input());
    const b = f.queue.submit(f.input());
    await until(() => a.status === 'running');
    assert.equal(b.status, 'queued');
    f.queue.cancel(a.id);
    await until(() => b.status === 'running');
    assert.equal(a.status, 'cancelled');
    f.queue.cancel(b.id);
    await until(() => !f.queue.hasRunningProject(b.projectId));
    assert.equal(b.status, 'cancelled');
  } finally {
    f.close();
  }
});
test('exit zero without terminal protocol result is failure, never a fabricated completion', async () => {
  const f = fixture(`process.stdin.resume();process.stdin.on('end',()=>console.log('{}'));`);
  try {
    const j = f.queue.submit(f.input());
    await until(() => j.status === 'failed');
    assert.match(j.error!, /CLI_NO_RESULT/);
  } finally {
    f.close();
  }
});
test('process failure, timeout and service shutdown do not retry tasks', async () => {
  for (const source of [`process.exit(2)`, `process.stdin.resume();setInterval(()=>{},100);`]) {
    const f = fixture(source);
    try {
      const j = f.queue.submit(f.input());
      await until(() => j.status === 'failed');
      assert.equal(f.store.jobs.length, 1);
    } finally {
      f.close();
    }
  }
  const f = fixture(`process.stdin.resume();setInterval(()=>{},100);`);
  try {
    const j = f.queue.submit(f.input());
    await until(() => j.status === 'running');
    f.queue.stop();
    await until(() => j.status === 'interrupted');
  } finally {
    f.close();
  }
});
test('restart interrupts queued CLI work instead of executing it again', () => {
  const f = fixture();
  try {
    const job = {
      ...f.input(),
      status: 'queued' as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      events: [],
      result: '',
    };
    f.store.jobs.push(job);
    f.store.saveJobs();
    const reopened = new Store(f.store.directory);
    reopened.recover();
    assert.equal(reopened.jobs[0]?.status, 'interrupted');
  } finally {
    f.close();
  }
});
test('all four adapters use structured output without shell or permission bypass', () => {
  for (const id of ['codex', 'claude', 'opencode', 'trae'] as const) {
    const args = cliArguments(id, 'exec');
    assert.doesNotMatch(args.join(' '), /yolo|bypass|dangerously|--auto/);
    assert.match(args.join(' '), /json/);
  }
  assert.ok(cliArguments('trae', 'print').includes('--print'));
});
test('protocol parsing distinguishes final reports, permission denial and intermediate/tool output', () => {
  assert.deepEqual(parseCliEvent('codex', { type: 'turn.completed' }), { done: true });
  assert.equal(
    parseCliEvent('codex', {
      type: 'item.completed',
      item: { type: 'command_execution', aggregated_output: 'SECRET' },
    }).text,
    undefined,
  );
  assert.equal(
    parseCliEvent('claude', {
      type: 'result',
      subtype: 'success',
      result: 'done',
      permission_denials: [{ tool_name: 'Bash' }],
    }).error,
    'CLI_PERMISSION_DENIED',
  );
  assert.equal(
    parseCliEvent('trae', { type: 'result', subtype: 'success', result: 'done' }).done,
    true,
  );
  assert.equal(
    parseCliEvent('opencode', { type: 'step_finish', part: { reason: 'tool-calls' } }).done,
    undefined,
  );
  assert.equal(
    parseCliEvent('opencode', { type: 'step_finish', part: { reason: 'stop' } }).done,
    true,
  );
});
test('a real started child is terminated on cancel and cannot overwrite the cancelled result', async () => {
  const f = fixture(
    `const fs=require('node:fs');fs.writeFileSync('child.pid',String(process.pid));process.stdin.resume();setInterval(()=>{},100);`,
  );
  try {
    const j = f.queue.submit(f.input());
    const { existsSync, readFileSync } = await import('node:fs');
    await until(() => existsSync(join(f.dir, 'child.pid')));
    const pid = Number(readFileSync(join(f.dir, 'child.pid'), 'utf8'));
    f.queue.cancel(j.id);
    await until(() => {
      try {
        process.kill(pid, 0);
        return false;
      } catch {
        return true;
      }
    });
    assert.equal(j.status, 'cancelled');
    assert.equal(j.result, '');
  } finally {
    f.close();
  }
});
test('malformed/missing projects and hostile origins never start a CLI process', () => {
  const f = fixture();
  try {
    assert.throws(() => f.queue.submit({ ...f.input(), projectId: randomUUID() }), /未绑定/);
    assert.throws(
      () =>
        f.queue.submit({ ...f.input(), selection: { ...selection, url: 'https://evil.invalid' } }),
      /未绑定/,
    );
    assert.equal(f.store.jobs.length, 0);
  } finally {
    f.close();
  }
});
test('OpenCode model errors retain the actual provider diagnostic', async () => {
  const f = fixture(
    `console.log(JSON.stringify({type:'error',error:{type:'provider.no-route',message:'Model unavailable: fixture/missing'}}));process.exit(1);`,
  );
  try {
    const j = f.queue.submit({ ...f.input(), executor: 'opencode' });
    await until(() => j.status === 'failed');
    assert.equal(j.error, 'CLI_MODEL_UNAVAILABLE');
    assert.match(JSON.stringify(j.events), /Model unavailable: fixture\/missing/);
  } finally {
    f.close();
  }
});
test('nonzero exit returns a redacted authentication diagnostic instead of a generic failure', async () => {
  const f = fixture(
    `console.error('Error: headless Codebase Git authentication failed; api_key=fixture-private-key');process.exit(1);`,
  );
  try {
    const j = f.queue.submit({ ...f.input(), executor: 'trae' });
    await until(() => j.status === 'failed');
    assert.equal(j.error, 'CLI_AUTH_REQUIRED');
    const activity = JSON.stringify(j.events);
    assert.match(activity, /Codebase Git authentication failed/);
    assert.doesNotMatch(activity, /fixture-private-key/);
  } finally {
    f.close();
  }
});
test('OpenCode v2 can complete with a final text and clean exit without step_finish', async () => {
  const f = fixture(
    `process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({type:'text',part:{text:'OpenCode final report'}})));`,
  );
  const runner = new CliRunner({
    resolve: async () => ({
      command: process.execPath,
      prefix: [join(f.dir, 'fake.cjs')],
      dialect: 'exec',
      completionOnExit: true,
    }),
    timeoutMs: 1500,
  });
  const queue = new Queue(f.store, runner);
  try {
    const j = queue.submit({ ...f.input(), executor: 'opencode' });
    await until(() => ['completed', 'failed'].includes(j.status));
    assert.equal(j.status, 'completed');
    assert.equal(j.result, 'OpenCode final report');
  } finally {
    queue.stop();
    f.close();
  }
});
test('OpenCode v2 completion never hides protocol failures or empty results', async () => {
  for (const source of [
    `console.log(JSON.stringify({type:'text',part:{text:'partial'}}));console.log(JSON.stringify({type:'error',error:{message:'Model unavailable: fixture/missing'}}));`,
    `console.log('{}');`,
  ]) {
    const f = fixture(source);
    const queue = new Queue(
      f.store,
      new CliRunner({
        resolve: async () => ({
          command: process.execPath,
          prefix: [join(f.dir, 'fake.cjs')],
          dialect: 'exec',
          completionOnExit: true,
        }),
        timeoutMs: 1500,
      }),
    );
    try {
      const j = queue.submit({ ...f.input(), executor: 'opencode' });
      await until(() => j.status === 'failed');
      assert.equal(j.result, '');
    } finally {
      queue.stop();
      f.close();
    }
  }
});
test('installed executable discovery detects OpenCode v2 completion contract', async () => {
  const f = fixture(
    `if(process.argv.includes('--version')){console.log('opencode v2.0.30');process.exit(0);}if(process.argv.includes('--help')){console.log('--format json --standalone');process.exit(0);}process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({type:'text',part:{text:'Discovered v2 report'}})));`,
  );
  const { chmodSync } = await import('node:fs');
  chmodSync(join(f.dir, 'fake.cjs'), 0o755);
  const previous = process.env.POINTDOM_OPENCODE_BIN;
  process.env.POINTDOM_OPENCODE_BIN = join(f.dir, 'fake.cjs');
  const queue = new Queue(f.store, new CliRunner());
  try {
    const j = queue.submit({ ...f.input(), executor: 'opencode' });
    await until(() => ['completed', 'failed'].includes(j.status));
    assert.equal(j.status, 'completed');
    assert.equal(j.result, 'Discovered v2 report');
  } finally {
    if (previous === undefined) delete process.env.POINTDOM_OPENCODE_BIN;
    else process.env.POINTDOM_OPENCODE_BIN = previous;
    queue.stop();
    f.close();
  }
});
