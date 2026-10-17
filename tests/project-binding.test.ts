import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desktopProjectLink } from '../src/extension/local-install.js';
import { wakeupInstruction } from '../src/shared/mcp-watch.js';

test('project links contain only a canonical HTTP origin', () => {
  assert.equal(
    desktopProjectLink('HTTPS://EXAMPLE.COM:443'),
    'pointdom://bind?origin=https%3A%2F%2Fexample.com',
  );
  for (const url of [
    'file:///tmp',
    'javascript:alert(1)',
    'https://u:p@example.com',
    'https://example.com/private',
    'https://example.com?token=secret',
    'https://example.com#private',
  ]) {
    assert.throws(() => desktopProjectLink(url));
  }
});

test('initial Codex setup includes exact project identity without inventing a recipient', () => {
  const project = { id: 'project-fixture', cwd: '/fixture/source', name: 'Fixture', origins: [] };
  const instruction = wakeupInstruction('en', project, '');
  assert.ok(instruction.includes(JSON.stringify({ path: project.cwd, projectId: project.id })));
  assert.ok(!instruction.includes('"connectionId"'));
  assert.ok(instruction.includes('CODEX_THREAD_ID'));
  assert.ok(instruction.includes('Never guess a thread ID'));
});
