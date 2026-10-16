import { test } from 'node:test';
import { buildSync } from 'esbuild';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  realpathSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const loader = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
const entry = resolve('src/bridge/main.ts');

for (const mode of ['install-home', 'install-project', 'install-zip', 'link-project'] as const) {
  test(`bundled setup: ${mode}`, () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'pointdom-setup-cli-')));
    const home = join(root, 'home');
    const project = join(home, 'Project with spaces');
    const state = join(root, 'state');
    const calls = join(root, 'calls.json');
    const preload = join(root, 'setup-fixture.mjs');
    mkdirSync(project, { recursive: true });
    const cli = join(root, 'app/dist/bridge/main.js');
    try {
      buildSync({
        entryPoints: [entry],
        bundle: true,
        platform: 'node',
        target: 'node24',
        format: 'esm',
        packages: 'external',
        outfile: cli,
      });
      writeFileSync(join(root, 'app/package.json'), JSON.stringify({ type: 'module' }));
      writeFileSync(
        join(root, 'app/dist/bridge/mcp.js'),
        '// Fixture entry for configuration export only.',
      );
      symlinkSync(resolve('node_modules'), join(root, 'node_modules'), 'dir');
      mkdirSync(join(root, 'app/dist/extension'));
      writeFileSync(join(root, 'app/dist/extension/manifest.json'), '{"manifest_version":3}');
      writeFileSync(calls, '[]');
      writeFileSync(
        preload,
        `
      import readline from 'node:readline';
      import childProcess from 'node:child_process';
      import { EventEmitter } from 'node:events';
      import { syncBuiltinESMExports } from 'node:module';
      import { writeFileSync } from 'node:fs';
      import { Store } from ${JSON.stringify(pathToFileURL(resolve('src/bridge/store.ts')).href)};
      import { Queue } from ${JSON.stringify(pathToFileURL(resolve('src/bridge/queue.ts')).href)};
      import { createApp } from ${JSON.stringify(pathToFileURL(resolve('src/bridge/server.ts')).href)};
      const store = new Store(${JSON.stringify(state)});
      const app = createApp(store, new Queue(store));
      const answers = ${JSON.stringify(mode === 'link-project' ? ['', project, 'yes', ''] : mode === 'install-zip' ? ['n', '', ''] : ['yes'])};
      const requests = [];
      globalThis.fetch = async (url, init) => {
        const headers = new Headers(init.headers);
        headers.set('Host', new URL(url).host);
        const response = await app.fetch(new Request(url, {...init, headers}));
        if (String(url).endsWith('/projects') && response.ok) requests.push(JSON.parse(init.body).path);
        writeFileSync(${JSON.stringify(calls)}, JSON.stringify(requests));
        return response;
      };
      Object.defineProperty(process.stdin, 'isTTY', {value: true});
      Object.defineProperty(process.stdout, 'isTTY', {value: true});
      readline.createInterface = () => {
        const rl = new EventEmitter();
        rl.close = () => rl.emit('close');
        rl.question = (question, done) => {
          if (!answers.length) throw new Error('Unexpected setup prompt');
          process.stdout.write(question);
          setImmediate(() => done(answers.shift()));
        };
        return rl;
      };
      const original = childProcess.execFileSync;
      childProcess.execFileSync = (command, ...args) => ['/usr/bin/open', '/usr/bin/pbcopy'].includes(command) ? Buffer.alloc(0) : original(command, ...args);
      syncBuiltinESMExports();
    `,
      );
      const result = spawnSync(
        process.execPath,
        [
          '--import',
          loader,
          '--import',
          pathToFileURL(preload).href,
          cli,
          'setup',
          ...(mode === 'link-project'
            ? ['--agent', 'generic', '--origin', 'http://localhost:5173']
            : []),
        ],
        {
          cwd: mode === 'install-project' ? project : home,
          env: { ...process.env, HOME: home, TMPDIR: root, PAGEPATCH_HOME: state, NO_COLOR: '1' },
          encoding: 'utf8',
          timeout: 15000,
        },
      );
      assert.equal(
        result.status,
        0,
        `Home-directory setup failed: ${result.stderr
          .split('\n')
          .filter((line) => line.startsWith('Error:'))
          .join(' ')}`,
      );
      assert.deepEqual(
        JSON.parse(readFileSync(calls, 'utf8')),
        mode === 'link-project' ? [project] : [],
      );
      if (mode === 'link-project') assert.match(result.stdout, /Project directory/);
      else {
        assert.doesNotMatch(
          result.stdout,
          /Project directory:|Development site URL|MCP configuration copied/,
        );
        assert.match(result.stdout, /pdo link --origin/);
        assert.match(result.stdout, /pdo connect --json/);
      }
      if (mode === 'install-zip') {
        assert.match(result.stdout, /Extension ZIP: .*pointdom-extension.zip/);
        assert.match(result.stdout, /Drag pointdom-extension.zip from Finder/);
        assert.doesNotMatch(result.stdout, /Extension folder:|Click Load unpacked|Cmd\+Shift\+G/);
      }
      assert.match(result.stdout, /Setup steps finished/);
      assert.doesNotMatch(result.stdout + result.stderr, /\p{Script=Han}|\n\s+at /u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test('setup reports a noninteractive usage error in English without a Node stack trace', () => {
  const result = spawnSync(process.execPath, ['--import', loader, entry, 'setup'], {
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /^Error: Run pdo setup in an interactive terminal\./);
  assert.doesNotMatch(result.stderr, /\p{Script=Han}|\n\s+at |file:\/\//u);
});
