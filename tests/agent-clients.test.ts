import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { clientEntries, clientSetupInstruction } from '../src/shared/agent-clients.js';
import type { AgentConnection } from '../src/shared/contracts.js';
import { agentSetupInstruction } from '../src/shared/agent-setup.js';

const connection = (name: string): AgentConnection => ({
  id: randomUUID(),
  projectId: randomUUID(),
  name,
  version: 'fixture',
  connectedAt: new Date().toISOString(),
  lastSeenAt: new Date().toISOString(),
});
test('client directory keeps offline setup entries and uses live connection IDs for selection', () => {
  const empty = clientEntries([]);
  assert.deepEqual(
    empty.map((entry) => entry.label),
    ['Codex', 'Trae', 'Claude Code', 'Zcode', 'OpenCode', '其他 MCP 客户端'],
  );
  assert.ok(empty.every((entry) => !entry.connection));
  const codex = connection('codex-mcp-client'),
    trae = connection('trae-coding-agent'),
    extra = connection('Independent host');
  const entries = clientEntries([codex, trae, extra]);
  assert.equal(entries.find((entry) => entry.label === 'Codex')?.connection?.id, codex.id);
  assert.equal(entries.find((entry) => entry.label === 'Trae')?.connection?.id, trae.id);
  assert.equal(
    entries.find((entry) => entry.label === 'Independent host')?.connection?.id,
    extra.id,
  );
  const duplicates = clientEntries([trae, connection('Trae')]).filter(
    (entry) => entry.preset.id === 'trae',
  );
  assert.equal(duplicates.length, 2);
  assert.notEqual(duplicates[0]!.label, duplicates[1]!.label);
  assert.ok(clientEntries([connection('not-codex')]).some((entry) => entry.label === 'not-codex'));
});
test('per-client setup copies are short, localized and use static guides with host-resolved project paths', () => {
  for (const id of ['codex', 'trae', 'claude', 'zcode', 'opencode', 'other'] as const) {
    const zh = clientSetupInstruction('zh-CN', id),
      en = clientSetupInstruction('en', id);
    assert.match(zh, /当前项目/);
    assert.match(zh, /pdo connect/);
    assert.match(zh, /pointdom_list_tasks/);
    assert.match(zh, /connection\.id/);
    assert.match(zh, /原生/);
    assert.match(zh, /重启或重连/);
    assert.match(zh, /执行中的批注/);
    assert.match(zh, /SDK/);
    assert.match(zh, /不领取任务/);
    assert.ok(zh.length < 600);
    assert.doesNotMatch(en, /\p{Script=Han}/u);
    assert.match(en, /pointdom_list_tasks/);
    assert.match(en, /connection\.id/);
    assert.match(en, /native/i);
    assert.match(en, /restart or reconnect/i);
    assert.match(en, /claimed work/i);
    assert.match(en, /Do not claim tasks/);
  }
  assert.match(clientSetupInstruction('zh-CN', 'trae'), /docs\/agents\/TRAE.md/);
  assert.match(clientSetupInstruction('en', 'codex'), /docs\/agents\/CODEX.md/);
  assert.match(clientSetupInstruction('en', 'zcode'), /docs\/agents\/GENERIC_MCP.md/);
});
test('generic setup instructions require a registered native connection and do not accept an empty legacy inbox as proof', () => {
  for (const language of ['zh-CN', 'en'] as const) {
    const instruction = agentSetupInstruction(language);
    assert.match(instruction, /connection\.id/);
    assert.match(instruction, /tasks: \[\]/);
    assert.match(instruction, /SDK/);
  }
});
