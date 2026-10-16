import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  guidedSetup,
  chooseProjectDirectory,
  clientConfig,
  agentPayload,
  type SetupActions,
} from '../src/bridge/setup.js';
import { projectDirectory } from '../src/bridge/projects.js';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, parse } from 'node:path';
import { cancelledSetup } from '../src/bridge/terminal.js';
import { terminalColor } from '../src/bridge/terminal.js';
import { stripVTControlCharacters } from 'node:util';

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
    bound: string[] = [],
    asked: string[] = [];
  let extensionCalls = 0;
  const actions: SetupActions = {
    ask: async (question) => {
      asked.push(question);
      assert.ok(answers.length, 'unexpected prompt');
      return answers.shift()!;
    },
    select: async (_question, choices) => {
      const value = answers.shift() || 'generic';
      assert.ok(choices.some((choice) => choice.value === value));
      return value;
    },
    print: (text) => printed.push(text),
    project: async () => '/project',
    bind: async (origin) => {
      bound.push(origin);
    },
    extension: () => {
      extensionCalls++;
      return {
        path: '/pointdom-extension.zip',
        format: 'zip',
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
  return { actions, printed, copied, opened, bound, asked, extensionCalls: () => extensionCalls };
}

test('setup highlights actions and commands while NO_COLOR and redirected output stay plain', async () => {
  const runs = [];
  for (const color of [false, true]) {
    const f = fixture(['n', '', '']);
    await guidedSetup(f.actions, { app: 'opencode', color });
    runs.push(f);
  }
  const [plain, colored] = runs;
  const output = colored!.printed.join('\n');
  assert.match(output, /\x1b\[1;36m1  Developer mode → ON\x1b\[0m/);
  assert.match(output, /\x1b\[1;36mpdo link --origin http:\/\/localhost:3000\x1b\[0m/);
  assert.match(colored!.asked.join('\n'), /\x1b\[1;36mEnter\x1b\[0m/);
  assert.equal(stripVTControlCharacters(output), plain!.printed.join('\n'));
  assert.equal(stripVTControlCharacters(colored!.asked.join('\n')), plain!.asked.join('\n'));
  assert.doesNotMatch(plain!.printed.join('\n'), /\x1b/);
  assert.ok(output.indexOf('Setup steps finished') < output.indexOf('Add a project later'));
  assert.equal(terminalColor({ isTTY: true }, { TERM: 'xterm-256color' }), true);
  assert.equal(terminalColor({ isTTY: true }, { TERM: 'xterm', NO_COLOR: '' }), false);
  assert.equal(terminalColor({ isTTY: false }, { TERM: 'xterm' }), false);
  assert.equal(terminalColor({ isTTY: true }, { TERM: 'dumb' }), false);
});
test('default installation only pairs the browser without choosing or changing the agent', async () => {
  const f = fixture(['n', '', '']);
  f.actions.project = async () => {
    throw new Error('Unexpected project prompt');
  };
  f.actions.select = async () => {
    throw new Error('Unexpected agent prompt');
  };
  Reflect.set(f.actions, 'preferAgent', async () => {
    throw new Error('Existing agent preference must be preserved');
  });
  f.actions.config = () => {
    throw new Error('Unexpected MCP export');
  };
  await guidedSetup(f.actions, { app: 'opencode' });
  assert.equal(f.extensionCalls(), 1);
  assert.deepEqual(f.bound, []);
  assert.deepEqual(f.copied, ['fixture-pairing-secret']);
  assert.match(f.printed.join('\n'), /pdo link --origin/);
  assert.doesNotMatch(f.printed.join('\n'), /Choose your agent|selected · MCP/);
});

test('installation-only setup never requests or links a project and defers project-scoped MCP', async () => {
  for (const cli of [false, true]) {
    const f = fixture(['yes']);
    f.actions.project = async () => {
      throw new Error('Installation must not request a directory');
    };
    f.actions.bind = async () => {
      throw new Error('Installation must not bind a project');
    };
    f.actions.config = () => {
      throw new Error('MCP configuration requires a future project');
    };
    Reflect.set(f.actions, 'cliAvailable', () => cli);
    await guidedSetup(f.actions, { app: 'opencode', agent: 'codex' });
    const output = f.printed.join('\n');
    assert.match(output, /Browser/);
    assert.doesNotMatch(output, /Choose your agent/);
    assert.match(output, /pdo link --origin/);
    assert.match(output, /pdo connect --json/);
    assert.match(output, /Setup steps finished/);
    assert.doesNotMatch(
      output,
      /Project directory:|Development site URL|MCP configuration copied|Daily use:/,
    );
    assert.deepEqual(f.opened, []);
    assert.deepEqual(f.copied, []);
  }
});

test('guided setup prints the pairing code at completion while keeping exported MCP settings credential-free', async () => {
  const f = fixture(['http://localhost:5173/path', 'n', '', '', 'generic', '']);
  await guidedSetup(f.actions, { app: 'opencode', linkProject: true });
  assert.deepEqual(f.bound, ['http://localhost:5173']);
  assert.equal(f.extensionCalls(), 1);
  assert.equal(f.copied[0], 'fixture-pairing-secret');
  assert.deepEqual(JSON.parse(f.copied[1]!), config);
  assert.equal(f.copied.length, 2);
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
  assert.match(output, /Drag pointdom-extension.zip from Finder/);
  assert.doesNotMatch(output, /Click Load unpacked|Cmd\+Shift\+G|Extension folder:/);
  assert.ok(output.indexOf('Drag pointdom-extension.zip') < output.indexOf('Pairing code copied'));
  assert.match(output, /Updates: pdo upgrade/);
});

test('setup always exports MCP even if an agent executable is available', async () => {
  const f = fixture(['yes', '']);
  Reflect.set(f.actions, 'cliAvailable', () => true);
  await guidedSetup(f.actions, {
    origin: 'http://localhost:5173',
    app: 'opencode',
    agent: 'opencode',
  });
  assert.ok(f.copied.some((text) => text.includes('mcp')));
  assert.match(f.printed.join('\n'), /MCP configuration copied/);
  assert.doesNotMatch(
    f.printed.join('\n'),
    /CLI detected|local CLI defaults|Agent instruction copied/,
  );
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
    if (agent === 'codex' || agent === 'claude') assert.deepEqual(JSON.parse(payload.text), config);
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

test('project directories support pasted paths while rejecting home, root, files and missing folders', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pointdom-project-path-')));
  const home = join(root, 'home');
  const project = join(home, '项目 with spaces');
  mkdirSync(project, { recursive: true });
  writeFileSync(join(root, 'file.txt'), 'fixture');
  symlinkSync(home, join(root, 'home-alias'), 'dir');
  try {
    for (const value of ['~/项目 with spaces', '项目 with spaces', `"${project}"`, project])
      assert.equal(projectDirectory(value, home, home), project);
    for (const value of [
      '',
      home,
      join(root, 'home-alias'),
      parse(root).root,
      join(root, 'file.txt'),
      join(root, 'missing'),
    ]) {
      assert.throws(
        () => projectDirectory(value, home, home),
        (error) => {
          assert.ok(error instanceof Error);
          assert.doesNotMatch(error.message, /\p{Script=Han}/u);
          return true;
        },
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('project selection retries invalid input, keeps valid defaults and honors explicit paths and cancellation', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'pointdom-project-prompt-')));
  try {
    const f = fixture(['', '/', join(root, 'missing'), root]);
    assert.equal(await chooseProjectDirectory(f.actions, homedir()), root);
    assert.equal(f.printed.filter((line) => line.startsWith('Error:')).length, 3);
    const valid = fixture(['']);
    assert.equal(await chooseProjectDirectory(valid.actions, root), root);
    const explicit = fixture([]);
    assert.equal(await chooseProjectDirectory(explicit.actions, root, true), root);
    await assert.rejects(
      chooseProjectDirectory(explicit.actions, homedir(), true),
      /specific project directory/,
    );
    const cancelled = fixture([]);
    cancelled.actions.ask = async () => {
      throw cancelledSetup();
    };
    await assert.rejects(chooseProjectDirectory(cancelled.actions, root), {
      code: 'SETUP_CANCELLED',
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
