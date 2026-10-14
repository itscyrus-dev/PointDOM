// Real OpenCode CLI with a local fake model: no external model calls or usage charges.
import { createServer } from 'node:http';
import { mkdtempSync, realpathSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { runOpenCode } from '../src/bridge/opencode.js';
import type { Job } from '../src/shared/contracts.js';
const directory = realpathSync(mkdtempSync(join(tmpdir(), 'pointdom-real-opencode-')));
const target = join(directory, 'button.css');
writeFileSync(target, 'button { height: 32px; }');
let calls = 0,
  approvals = 0,
  output = '';
const model = createServer(async (request, response) => {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw);
  calls++;
  const edited = readFileSync(target, 'utf8').includes('40px');
  const delta = edited
    ? { role: 'assistant', content: '已将 button.css 高度改为 40px，文件内容已检查。' }
    : {
        role: 'assistant',
        tool_calls: [
          {
            index: 0,
            id: `call_${calls}`,
            type: 'function',
            function: {
              name: 'edit',
              arguments: JSON.stringify({ filePath: target, oldString: '32px', newString: '40px' }),
            },
          },
        ],
      };
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  response.write(
    `data: ${JSON.stringify({ id: `chatcmpl_${calls}`, object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`,
  );
  response.write(
    `data: ${JSON.stringify({ id: `chatcmpl_${calls}`, object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta: {}, finish_reason: edited ? 'stop' : 'tool_calls' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`,
  );
  response.end('data: [DONE]\n\n');
});
await new Promise<void>((resolve) => model.listen(0, '127.0.0.1', resolve));
const address = model.address();
assert.ok(address && typeof address !== 'string');
process.env.XDG_CONFIG_HOME = join(directory, 'config');
process.env.XDG_DATA_HOME = join(directory, 'data');
process.env.XDG_CACHE_HOME = join(directory, 'cache');
process.env.OPENCODE_CONFIG_CONTENT = JSON.stringify({
  model: 'fixture/fixture',
  plugin: [],
  provider: {
    fixture: {
      npm: '@ai-sdk/openai-compatible',
      name: 'Local fixture',
      options: { baseURL: `http://127.0.0.1:${address.port}/v1`, apiKey: 'fixture-only' },
      models: { fixture: { name: 'Fixture', limit: { context: 16000, output: 1000 } } },
    },
  },
});
const job: Job = {
  id: randomUUID(),
  executor: 'opencode',
  projectId: randomUUID(),
  instruction: '将按钮高度改为 40px',
  status: 'queued',
  createdAt: '',
  updatedAt: '',
  events: [],
  result: '',
  selection: {
    url: 'http://localhost:5173',
    title: 'fixture',
    selector: 'button',
    label: 'button',
    tag: 'button',
    viewport: { width: 100, height: 100 },
    rect: { x: 0, y: 0, width: 10, height: 10 },
    styles: {},
  },
};
const handle = runOpenCode(
  {
    id: job.projectId,
    name: 'fixture',
    cwd: directory,
    origins: ['http://localhost:5173'],
    openCodeModel: 'fixture/fixture',
  },
  job,
  undefined,
  {
    event: () => {},
    thread: () => {},
    approved: () => {},
    result: (text) => {
      output += text;
    },
    approval: (approval) => {
      if (approval.kind !== 'files' || !approval.details.includes('button.css')) {
        handle.cancel();
        return;
      }
      approvals++;
      handle.reply(approval.id, { decision: 'accept' });
    },
  },
);
const deadline = setTimeout(() => handle.cancel(), 45000);
try {
  await handle.done;
  assert.ok(approvals > 0, 'real CLI must ask before editing');
  assert.ok(calls >= 2);
  assert.match(readFileSync(target, 'utf8'), /40px/);
  assert.match(output, /button.css/);
  console.log(
    'Real OpenCode CLI + local model + permission + file edit + result: passed (no paid model)',
  );
} finally {
  clearTimeout(deadline);
  handle.cancel();
  model.closeAllConnections();
  await new Promise<void>((resolve) => model.close(() => resolve()));
  // Allow the owned CLI process to exit before removing its isolated state.
  await new Promise((resolve) => setTimeout(resolve, 2200));
  rmSync(directory, { recursive: true, force: true });
}
