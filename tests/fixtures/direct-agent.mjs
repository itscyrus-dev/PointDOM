import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
if (process.argv.includes('--version')) {
  console.log('opencode v2.0.29');
  process.exit(0);
}
const claude = process.argv.includes('--output-format');
const send = (message) => process.stdout.write(JSON.stringify(message) + '\n');
let prompt,
  session = 'fixture-session',
  question = false;
const mode = process.env.POINTDOM_FIXTURE_CASE || 'edit';
if (
  mode === 'reduced' &&
  process.argv.includes('--permission-mode') &&
  process.argv[process.argv.indexOf('--permission-mode') + 1] !== 'auto'
)
  process.exit(12);
const write = () => writeFileSync(join(process.cwd(), 'button.css'), 'button { height: 40px; }');
function complete(allowed) {
  if (allowed) write();
  const text = allowed ? '已修改 button.css 并验证' : '用户拒绝，未修改文件';
  if (claude)
    send({
      type: 'result',
      subtype: mode === 'error' ? 'error_during_execution' : 'success',
      is_error: mode === 'error',
      result: text,
      session_id: session,
      errors: ['fake-key-must-not-leak'],
    });
  else {
    send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: session,
        update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } },
      },
    });
    send({
      jsonrpc: '2.0',
      id: prompt.id,
      result: { stopReason: mode === 'error' ? 'max_tokens' : 'end_turn' },
    });
  }
}
createInterface({ input: process.stdin }).on('line', (line) => {
  const m = JSON.parse(line);
  if (claude) {
    if (m.type === 'control_request') {
      send({
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: m.request_id,
          response: { commands: [], models: [], account: {} },
        },
      });
    }
    if (m.type === 'user') {
      if (!JSON.stringify(m.message).includes('untrustedPageContext')) process.exit(9);
      send({ type: 'system', subtype: 'init', session_id: session });
      if (mode === 'exit') process.exit(1);
      question = mode === 'question';
      send({
        type: 'control_request',
        request_id: 'permission-1',
        request: {
          subtype: 'can_use_tool',
          tool_name: question ? 'AskUserQuestion' : 'Edit',
          input: question
            ? { questions: [{ question: '确认尺寸', options: [{ label: '40px' }] }] }
            : {
                file_path: join(process.cwd(), 'button.css'),
                old_string: '32px',
                new_string: '40px',
              },
          tool_use_id: 'fixture-tool',
        },
      });
    }
    if (m.type === 'control_response' && m.response.request_id === 'permission-1') {
      if (m.response.response?.updatedPermissions) process.exit(10);
      complete(m.response.response?.behavior === 'allow');
    }
    return;
  }
  const respond = (result) => send({ jsonrpc: '2.0', id: m.id, result });
  if (m.method === 'initialize') {
    if (
      m.params.protocolVersion !== 1 ||
      m.params.clientCapabilities.fs ||
      m.params.clientCapabilities.terminal
    )
      process.exit(6);
    respond({ protocolVersion: mode === 'protocol' ? 9 : 1, agentCapabilities: {} });
  }
  if (m.method === 'session/new') {
    if (m.params.cwd !== process.cwd() || m.params.mcpServers.length) process.exit(7);
    respond({ sessionId: session });
  }
  if (m.method === 'session/set_config_option') respond({});
  if (m.method === 'session/prompt') {
    prompt = m;
    if (!m.params.prompt[0].text.includes('untrustedPageContext')) process.exit(8);
    if (mode === 'exit') process.exit(1);
    if (mode === 'no-result') {
      respond({ stopReason: 'end_turn' });
      return;
    }
    send({
      jsonrpc: '2.0',
      method: 'session/request_permission',
      id: 'permission-1',
      params: {
        sessionId: session,
        toolCall: {
          kind: mode === 'command' ? 'execute' : 'edit',
          title: '修改 button.css',
          rawInput: mode === 'masked-command' ? { command: 'pnpm test' } : {},
          locations:
            mode === 'no-path'
              ? []
              : [
                  {
                    path:
                      mode === 'outside'
                        ? join(process.cwd(), '../outside.css')
                        : join(process.cwd(), 'button.css'),
                  },
                ],
        },
        options: [
          { kind: 'allow_always', optionId: 'forever' },
          { kind: 'allow_once', optionId: 'once' },
          { kind: 'reject_once', optionId: 'reject' },
        ],
      },
    });
  }
  if (m.id === 'permission-1' && m.result) {
    if (m.result.outcome.optionId === 'forever') process.exit(10);
    complete(m.result.outcome.optionId === 'once');
  }
  if (m.method === 'session/cancel') {
    respond({ stopReason: 'cancelled' });
  }
});
