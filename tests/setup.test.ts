import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guidedSetup, clientConfig, agentPayload, type SetupActions } from '../src/bridge/setup.js';

const config = {
  mcpServers: {
    pointdom_fixture: {
      command: '/node',
      args: ['/app/mcp.js', '--project', '/project'],
      env: { PAGEPATCH_HOME: '/state' },
    },
  },
};
function fixture(answers: string[], clipboard = true) {
  const printed: string[] = [],
    copied: string[] = [],
    opened: string[] = [],
    bound: string[] = [];
  let extensionCalls = 0;
  const actions: SetupActions = {
    ask: async () => {
      assert.ok(answers.length, 'unexpected prompt');
      return answers.shift()!;
    },
    select: async (_question, choices) => {
      const value = answers.shift() || 'generic';
      assert.ok(choices.some((choice) => choice.value === value));
      return value;
    },
    print: (text) => printed.push(text),
    bind: async (origin) => {
      bound.push(origin);
    },
    extension: () => {
      extensionCalls++;
      return {
        path: '/PointDOM Extension',
        platform: 'darwin',
        chromeOpened: true,
        folderOpened: true,
        pathCopied: true,
      };
    },
    pairingCode: () => 'fixture-pairing-secret',
    config: () => config,
    copy: (text) => {
      copied.push(text);
      return clipboard;
    },
    open: (url) => {
      opened.push(url);
      return false;
    },
  };
  return { actions, printed, copied, opened, bound, extensionCalls: () => extensionCalls };
}
test('guided setup prints the pairing code at completion while keeping exported MCP settings credential-free', async () => {
  const f = fixture(['http://localhost:5173/path', 'n', '', '', 'generic', '']);
  await guidedSetup(f.actions, { app: 'opencode' });
  assert.deepEqual(f.bound, ['http://localhost:5173']);
  assert.equal(f.extensionCalls(), 1);
  assert.equal(f.copied[0], 'fixture-pairing-secret');
  assert.deepEqual(JSON.parse(f.copied[1]!), config);
  assert.match(f.copied[2]!, /claim before editing/);
  assert.doesNotMatch(f.printed.join(''), /\x1b\[/);
  assert.equal(f.printed.filter((line) => line === 'fixture-pairing-secret').length, 1);
  assert.ok(
    f.printed.indexOf('fixture-pairing-secret') >
      f.printed.findIndex((line) => line.includes('Setup steps finished')),
  );
  assert.equal(JSON.stringify(config).includes('fixture-pairing-secret'), false);
  assert.deepEqual(f.opened, ['http://localhost:5173']);
  assert.match(f.printed.join('\n'), /Open your project page: http:\/\/localhost:5173/);
  assert.match(f.printed.join('\n'), /confirm the Chrome permission prompt/);
  const output = f.printed.join('\n');
  assert.match(output, /Click Load unpacked/);
  assert.match(output, /Cmd\+Shift\+G, paste the copied path/);
  assert.ok(output.indexOf('paste the copied path') < output.indexOf('Pairing code copied'));
  assert.match(output, /Updates: pdo upgrade/);
});

test('detected CLI setup remembers the selected agent and skips MCP configuration and model prompts', async () => {
  const f = fixture(['yes']);
  const chosen: string[] = [];
  f.actions.cliAvailable = (agent) => agent === 'opencode';
  f.actions.preferAgent = async (agent) => {
    chosen.push(agent);
  };
  f.actions.config = () => {
    throw new Error('CLI setup must not export MCP settings');
  };
  await guidedSetup(f.actions, {
    origin: 'http://localhost:5173',
    app: 'opencode',
    agent: 'opencode',
  });
  assert.deepEqual(chosen, ['opencode']);
  assert.equal(f.copied.length, 0);
  assert.match(f.printed.join('\n'), /OpenCode CLI detected/);
  assert.match(f.printed.join('\n'), /local CLI defaults/);
  assert.doesNotMatch(f.printed.join('\n'), /MCP configuration copied/);
  assert.equal(f.printed.filter((line) => line === 'fixture-pairing-secret').length, 1);
});

test('setup opens only the linked project origin and reports the requested browser action honestly', async () => {
  const f = fixture(['yes', '']);
  f.actions.open = (url) => {
    f.opened.push(url);
    return true;
  };
  await guidedSetup(f.actions, {
    origin: 'http://localhost:3000/studio',
    agent: 'generic',
    app: 'opencode',
  });
  assert.deepEqual(f.opened, ['http://localhost:3000']);
  assert.match(f.printed.join('\n'), /Project page requested: http:\/\/localhost:3000/);
  assert.doesNotMatch(f.printed.join('\n'), /Page access enabled/);
});
test('guided setup skips existing browser pairing, supports native OpenCode and CC Switch', async () => {
  for (const client of ['opencode', 'cc-switch'] as const) {
    const f = fixture(['yes', '']);
    await guidedSetup(f.actions, { origin: 'http://localhost:3000', client, app: 'claude' });
    assert.equal(f.extensionCalls(), 0);
    assert.equal(f.copied.includes('fixture-pairing-secret'), false);
    assert.equal(f.printed.filter((line) => line === 'fixture-pairing-secret').length, 1);
    if (client === 'cc-switch') {
      const link = new URL(f.opened[0]!);
      assert.equal(link.searchParams.get('apps'), 'claude');
      assert.equal(f.printed.join('\n').includes('import requested'), false); // Opening failed; no false success.
    } else assert.deepEqual(JSON.parse(f.copied[0]!), clientConfig(config, client));
  }
});
test('clipboard failure shows the pairing code directly and invalid origins never reveal it', async () => {
  const fallback = fixture(['n', '', '', 'generic', ''], false);
  await guidedSetup(fallback.actions, {
    origin: 'http://localhost:5173',
    client: 'standard',
    app: 'opencode',
  });
  assert.equal(fallback.printed.filter((line) => line === 'fixture-pairing-secret').length, 2);
  assert.doesNotMatch(fallback.printed.join('\n'), /Run pdo pair/);
  for (const origin of ['file:///tmp/project', 'https://user:password@example.com']) {
    const f = fixture([]);
    await assert.rejects(guidedSetup(f.actions, { origin, app: 'opencode' }));
    assert.equal(f.bound.length, 0);
    assert.equal(f.extensionCalls(), 0);
    assert.equal(f.printed.join('').includes('fixture-pairing-secret'), false);
  }
});

test('each agent uses a credential-free payload while local completion displays a copyable pairing code', async () => {
  for (const agent of ['generic', 'codex', 'claude', 'opencode', 'trae', 'other'] as const) {
    const f = fixture(['yes', '']);
    await guidedSetup(f.actions, {
      origin: 'http://localhost:5173',
      app: 'opencode',
      agent,
      color: true,
    });
    assert.match(f.printed.join(''), /\x1b\[32m/);
    const payload = agentPayload(config, agent);
    assert.equal(f.copied[0], payload.text);
    assert.equal(f.copied[0]!.includes('fixture-pairing-secret'), false);
    if (agent === 'codex' || agent === 'claude') assert.match(payload.text, /'mcp' 'add'/);
    else assert.ok(JSON.parse(payload.text));
  }
});

test('setup shows manual browser fallbacks without claiming clipboard or desktop success', async () => {
  const f = fixture(['n', '', '', '']);
  f.actions.extension = () => ({
    path: '/fixture/PointDOM Extension',
    platform: 'darwin',
    chromeOpened: false,
    folderOpened: false,
    pathCopied: false,
  });
  await guidedSetup(f.actions, {
    origin: 'http://localhost:3000',
    agent: 'generic',
    app: 'opencode',
  });
  const output = f.printed.join('\n');
  assert.match(output, /Open chrome:\/\/extensions/);
  assert.match(output, /enter \/fixture\/PointDOM Extension/);
  assert.doesNotMatch(output, /Extension folder path copied|Requested the extension/);
});
