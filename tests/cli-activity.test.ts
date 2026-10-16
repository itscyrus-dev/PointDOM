import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cliActivity } from '../src/bridge/cli-activity.js';
test('Codex/Trae report actual commands, exit status, output and changed paths', () => {
  for (const id of ['codex', 'trae'] as const) {
    const parse = cliActivity(id);
    assert.match(
      parse({
        type: 'item.started',
        item: { id: '1', type: 'command_execution', command: 'pnpm check' },
      }).join('\n'),
      /pnpm check/,
    );
    assert.match(
      parse({
        type: 'item.completed',
        item: {
          id: '1',
          type: 'command_execution',
          command: 'pnpm check',
          exit_code: 1,
          status: 'failed',
          aggregated_output: '2 tests failed',
        },
      }).join('\n'),
      /exit=1[\s\S]*2 tests failed/,
    );
    assert.match(
      parse({
        type: 'item.completed',
        item: {
          type: 'file_change',
          status: 'completed',
          changes: [{ path: 'src/card.tsx', kind: 'update' }],
        },
      }).join('\n'),
      /src\/card.tsx/,
    );
  }
});
test('Claude correlates tool results to tool calls without emitting thinking or edit content', () => {
  const parse = cliActivity('claude');
  const start = parse({
    type: 'assistant',
    message: {
      content: [
        { type: 'thinking', thinking: 'PRIVATE_THOUGHT' },
        {
          type: 'tool_use',
          id: 't1',
          name: 'Edit',
          input: { file_path: 'src/card.tsx', new_string: 'PRIVATE_SOURCE' },
        },
      ],
    },
  }).join('\n');
  assert.match(start, /Edit.*src\/card.tsx/);
  assert.doesNotMatch(start, /PRIVATE/);
  const result = parse({
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 't1', is_error: false, content: 'File updated' },
      ],
    },
  }).join('\n');
  assert.match(result, /Edit.*src\/card.tsx[\s\S]*File updated/);
  assert.deepEqual(
    parse({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: 'PRIVATE' }] } }),
    [],
  );
});
test('OpenCode records tool status, command, output and errors', () => {
  const parse = cliActivity('opencode');
  const event = {
    type: 'tool_use',
    part: {
      callID: 'a',
      tool: 'bash',
      state: { status: 'completed', input: { command: 'pnpm test' }, output: '108 passed' },
    },
  };
  assert.match(parse(event).join('\n'), /pnpm test[\s\S]*108 passed/);
  assert.deepEqual(parse(event), [], 'same event retry must not duplicate activity');
  assert.match(
    parse({
      type: 'tool_use',
      part: {
        callID: 'b',
        tool: 'read',
        state: { status: 'error', input: { filePath: 'missing.ts' }, error: 'File not found' },
      },
    }).join('\n'),
    /error[\s\S]*missing.ts[\s\S]*File not found/,
  );
});
test('records redact credentials and bound individual outputs, without manufacturing events', () => {
  const parse = cliActivity('codex');
  const text = parse({
    type: 'item.completed',
    item: {
      id: 'secret',
      type: 'command_execution',
      command: 'curl -H "Authorization: Bearer abcdefghi" https://u:password@example.com',
      exit_code: 0,
      aggregated_output: '{"api_key":"private-value"}\n' + 'x'.repeat(10000),
    },
  }).join('\n');
  assert.doesNotMatch(text, /abcdefghi|private-value|u:password/);
  assert.ok(text.length < 5000);
  assert.match(text, /truncated/);
  assert.deepEqual(parse({ type: 'unknown', payload: 'do not invent' }), []);
});
