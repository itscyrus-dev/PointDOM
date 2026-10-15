import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { selectChoice } from '../src/bridge/terminal.js';
class Terminal extends PassThrough {
  isTTY = true;
  isRaw = false;
  columns = 80;
  setRawMode(value: boolean) {
    this.isRaw = value;
    return this;
  }
}
const choices = [
  { value: 'generic', label: 'Generic MCP (default)' },
  { value: 'codex', label: 'Codex' },
  { value: 'claude', label: 'Claude Code' },
];
test('arrow menu navigates, wraps and restores raw mode and key handlers after Enter', async () => {
  const input = new Terminal(),
    output = new Terminal();
  let rendered = '';
  output.on('data', (chunk) => {
    rendered += chunk.toString();
  });
  const selected = selectChoice('Choose your agent', choices, true, input, output);
  assert.equal(input.isRaw, true);
  input.write('\x1b[A'); // Wrap to the last option.
  input.write('\x1b[B'); // Back to default.
  input.write('\x1b[B'); // Codex.
  input.write('\r');
  assert.equal(await selected, 'codex');
  assert.equal(input.isRaw, false);
  assert.equal(input.listenerCount('keypress'), 0);
  assert.match(rendered, /Generic MCP/);
  assert.match(rendered, /\x1b\[32m/);
  assert.ok(rendered.endsWith('\x1b[?25h'));
});
test('default Enter uses generic MCP, Ctrl+C cancels cleanly, plain rendering has no colors', async () => {
  for (const key of ['\r', '\x03']) {
    const input = new Terminal(),
      output = new Terminal();
    let rendered = '';
    output.on('data', (chunk) => {
      rendered += chunk.toString();
    });
    const selected = selectChoice('Agent', choices, false, input, output);
    // Attach rejection handling before emitting Ctrl+C.
    const result = selected.then(
      (value) => value,
      (error: Error & { code: string }) => error.code,
    );
    input.write(key);
    assert.equal(await result, key === '\r' ? 'generic' : 'SETUP_CANCELLED');
    assert.equal(input.isRaw, false);
    assert.doesNotMatch(rendered, /\x1b\[32m/);
  }
});
