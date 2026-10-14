// Explicit opt-in: runs a real Codex task using your signed-in account.
import { mkdtempSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runCodex } from '../src/bridge/codex.js';
import type { Job } from '../src/shared/contracts.js';
const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'pagepatch-smoke-')));
writeFileSync(join(cwd, 'button.css'), '.send { height: 32px; border-radius: 12px; }\n');
writeFileSync(
  join(cwd, 'AGENTS.md'),
  'Only edit button.css. Do not install dependencies, access network, or change any other file.\n',
);
const job: Job = {
  id: randomUUID(),
  projectId: randomUUID(),
  instruction:
    '只将 button.css 中 .send 的 height 从 32px 改成 40px，圆角保持 12px。用 cat 检查，中文简短汇报。',
  selection: {
    url: 'http://127.0.0.1:5173/',
    title: 'Smoke test',
    label: '发送',
    selector: '.send',
    tag: 'button',
    viewport: { width: 1200, height: 800 },
    rect: { x: 0, y: 0, width: 40, height: 32 },
    styles: { height: '32px' },
  },
  status: 'running',
  createdAt: new Date().toISOString(),
  updatedAt: '',
  events: [],
  result: '',
};
const runner = runCodex(
  { id: job.projectId, name: '临时验证', cwd, origins: ['http://127.0.0.1:5173'] },
  job,
  undefined,
  {
    event: (text) => console.log(text),
    result: (text) => console.log(text),
    thread: () => console.log('Codex session started'),
    approval: (request) => {
      console.log(`需要人工批准，smoke test 不自动批准：${request.title}`);
      runner.reply(request.id, { decision: 'decline' });
    },
    approved() {},
  },
);
const deadline = setTimeout(() => runner.cancel(), 120000);
try {
  await runner.done;
  const css = readFileSync(join(cwd, 'button.css'), 'utf8');
  if (!css.includes('height: 40px') || !css.includes('border-radius: 12px'))
    throw new Error('实际文件未达到预期');
  console.log(`SMOKE_OK ${cwd}`);
} finally {
  clearTimeout(deadline);
}
