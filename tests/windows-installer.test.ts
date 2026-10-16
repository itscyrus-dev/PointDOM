import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { AddressInfo } from 'node:net';

test(
  'Windows one-command install starts a private service, authorizes this extension and preserves data on reuse',
  { skip: process.platform !== 'win32', timeout: 120000 },
  async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pointdom-windows-install-'));
    const home = join(directory, "home space's"),
      app = join(directory, 'package/pointdom');
    let pid: number | undefined;
    const files = new Map<string, Buffer>();
    const server = createServer((request, response) => {
      const file = files.get(request.url || '');
      response.writeHead(file ? 200 : 404);
      response.end(file || 'Not found');
    });
    const env = {
      ...process.env,
      USERPROFILE: home,
      HOME: home,
      LOCALAPPDATA: join(home, 'Local'),
      APPDATA: join(home, 'Roaming'),
      PAGEPATCH_HOME: join(home, '.pagepatch'),
      POINTDOM_SKIP_PATH: '1',
    };
    const run = (command: string, args: string[]) =>
      new Promise<{ code: number | null; stdout: string; stderr: string }>((done, reject) => {
        const child = spawn(command, args, { env, windowsHide: true, stdio: 'pipe' });
        let stdout = '',
          stderr = '';
        child.stdout.on('data', (data) => (stdout += data));
        child.stderr.on('data', (data) => (stderr += data));
        child.once('error', reject);
        child.once('exit', (code) => done({ code, stdout, stderr }));
      });
    try {
      // Refuse to touch an unrelated service on a developer's machine.
      const probe = createServer();
      await new Promise<void>((done, reject) => {
        probe.once('error', reject);
        probe.listen(4318, '127.0.0.1', done);
      });
      await new Promise<void>((done) => probe.close(() => done()));
      mkdirSync(join(app, 'dist/extension'), { recursive: true });
      mkdirSync(home, { recursive: true });
      await build({
        entryPoints: ['src/bridge/main.ts', 'src/bridge/mcp.ts'],
        bundle: true,
        platform: 'node',
        target: 'node24',
        format: 'esm',
        banner: {
          js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
        },
        outdir: join(app, 'dist/bridge'),
      });
      writeFileSync(
        join(app, 'package.json'),
        JSON.stringify({ type: 'module', version: '0.3.1' }),
      );
      writeFileSync(
        join(app, 'dist/extension/manifest.json'),
        '{"manifest_version":3,"version":"0.3.1"}',
      );
      const archive = join(directory, 'pointdom.tar.gz');
      execFileSync('tar.exe', ['-czf', archive, '-C', join(directory, 'package'), 'pointdom']);
      const bytes = readFileSync(archive);
      files.set('/pointdom.tar.gz', bytes);
      files.set(
        '/SHA256SUMS',
        Buffer.from(`${createHash('sha256').update(bytes).digest('hex')}  pointdom.tar.gz\n`),
      );
      await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
      const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const script = readFileSync(resolve('install.ps1'), 'utf8').replace(
        'https://github.com/itscyrus-dev/PointDOM/releases/latest/download',
        origin,
      );
      const path = join(directory, 'install.ps1');
      writeFileSync(path, script);
      const extensionId = 'a'.repeat(32),
        nonce = 'b'.repeat(64);
      const challenge = createHash('sha256').update(nonce).digest('hex');
      // Invoke the same scriptblock form as the copied command, without changing policy.
      const invocation = `& ([scriptblock]::Create([IO.File]::ReadAllText('${path.replaceAll("'", "''")}'))) -ExtensionId ${extensionId} -Challenge ${challenge}`;
      const first = await run('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        invocation,
      ]);
      assert.equal(first.code, 0, first.stderr);
      assert.match(first.stdout, /Browser authorized/);
      const config = readFileSync(join(home, '.pagepatch/config.json'), 'utf8');
      const status = await fetch('http://127.0.0.1:4318/api/local/status', {
        headers: { Authorization: `Bearer ${JSON.parse(config).token}`, 'X-PagePatch-Local': '1' },
      });
      pid = (await status.json()).pid;
      const poll = await fetch('http://127.0.0.1:4318/api/bootstrap', {
        method: 'POST',
        headers: {
          Origin: `chrome-extension://${extensionId}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nonce }),
      });
      assert.equal(poll.status, 200);
      const second = await run('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        invocation,
      ]);
      assert.equal(second.code, 0, second.stderr);
      assert.equal(readFileSync(join(home, '.pagepatch/config.json'), 'utf8'), config);
      const cli = join(home, '.local/bin/pdo.cmd');
      assert.ok(existsSync(cli));
      assert.ok(
        existsSync(join(env.APPDATA, 'Microsoft/Windows/Start Menu/Programs/Startup/PointDOM.lnk')),
      );
      assert.doesNotMatch(first.stdout + second.stdout, new RegExp(JSON.parse(config).token));
      const removal = await run('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `& '${cli.replaceAll("'", "''")}' uninstall`,
      ]);
      assert.equal(removal.code, 0, removal.stderr);
      assert.equal(readFileSync(join(home, '.pagepatch/config.json'), 'utf8'), config);
    } finally {
      if (pid)
        try {
          process.kill(pid);
        } catch {
          /* Already stopped. */
        }
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
    }
  },
);
