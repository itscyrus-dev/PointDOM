import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { upgrade } from './upgrade.js';
import { connectionApp, connectionConfig, connectionLink } from './connection.js';
import { serve } from '@hono/node-server';
import {
  existsSync,
  realpathSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
  readFileSync,
} from 'node:fs';
import { resolve, basename } from 'node:path';
import { homedir } from 'node:os';
import { Store } from './store.js';
import { Queue } from './queue.js';
import { createApp } from './server.js';
import { bindingSchema, bindProject } from './projects.js';
import { installService, uninstallService } from './service.js';
const directory = resolve(process.env.PAGEPATCH_HOME || `${homedir()}/.pagepatch`);
const args = process.argv.slice(2);
function option(name: string) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
}
const lock = resolve(directory, 'bridge.pid');
function locked() {
  if (!existsSync(lock)) return false;
  try {
    process.kill(Number(readFileSync(lock, 'utf8')), 0);
    return true;
  } catch {
    unlinkSync(lock);
    return false;
  }
}
function config() {
  if (!existsSync(resolve(directory, 'config.json')))
    throw new Error('Install the PointDOM background service first.');
  return JSON.parse(readFileSync(resolve(directory, 'config.json'), 'utf8')) as Store['config'];
}
async function local(path: string, body?: unknown) {
  const response = await fetch(`http://127.0.0.1:4318/api/local${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${config().token}`,
      'X-PagePatch-Local': '1',
      'Content-Type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5000),
  });
  const result = (await response.json()) as { error?: string; project?: { name: string } };
  if (!response.ok) throw new Error(result.error || 'Local service request failed');
  return result;
}
if (args[0] === 'upgrade') {
  await upgrade(fileURLToPath(import.meta.url));
} else if (args[0] === 'upgrade-stop') {
  // Internal installer handshake: the bridge atomically refuses active work and
  // pauses new task submissions/claims until it is stopped or the lease expires.
  await local('/upgrade/prepare', {});
  try {
    uninstallService();
  } catch (error) {
    await local('/upgrade/release', {}).catch(() => {});
    throw error;
  }
} else if (args[0] === 'connect') {
  const app = connectionApp.parse(option('--app') || 'opencode');
  const cwd = realpathSync(resolve(option('--path') || process.cwd()));
  const origin = option('--origin');
  if (origin) {
    const input = bindingSchema.parse({ path: cwd, name: basename(cwd), origin });
    await local('/projects', input);
  }
  const exported = connectionConfig(
    config(),
    cwd,
    directory,
    fileURLToPath(new URL('./mcp.js', import.meta.url)),
  );
  if (args.includes('--json')) console.log(JSON.stringify(exported, null, 2));
  else {
    const link = connectionLink(exported, app);
    if (args.includes('--url')) console.log(link);
    else {
      let opened = false;
      if (process.platform === 'darwin') {
        try {
          execFileSync('/usr/bin/open', [link], { stdio: 'pipe', timeout: 10000 });
          opened = true;
        } catch {
          /* Keep a copy/paste fallback when the protocol is unavailable. */
        }
      }
      if (opened)
        console.log(
          `CC Switch import requested for ${app}. Confirm the import, then restart your agent.`,
        );
      else {
        console.log('Open this link to import into CC Switch:');
        console.log(link);
        console.log(
          'If your CC Switch version cannot import links, run pdo connect --json and paste the config into Add MCP.',
        );
      }
      console.log(
        'In the browser extension, select Other Agent (MCP), submit an annotation, then ask your agent to process pending PagePatch tasks.',
      );
      console.log(
        'After upgrading PointDOM, remove the previous PointDOM entry in CC Switch if it is no longer used.',
      );
    }
  }
} else if (args[0] === 'install') {
  if (locked())
    throw new Error(
      'Stop the existing service before installing login startup. This will stop active tasks.',
    );
  const launcher = installService(directory);
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await local('/defaults', {});
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!ready)
    throw new Error(
      'Login startup was registered, but the service is not ready. Run pdo status and check that port 4318 is available.',
    );
  if (!args.includes('--quiet')) {
    console.log(`PointDOM background service is ready. CLI: ${launcher}`);
    console.log('Next: run pdo link --origin http://localhost:5173 from your project directory.');
  }
} else if (args[0] === 'uninstall') {
  uninstallService();
  console.log(
    'Background service removed. Project bindings, pairing and task history were preserved.',
  );
} else if (args[0] === 'link' || (args[0] === 'project' && args[1] === 'add')) {
  const cwd = realpathSync(resolve(option('--path') || process.cwd()));
  const input = bindingSchema.parse({
    path: cwd,
    name: option('--name') || basename(cwd),
    origin: option('--origin'),
    ...(option('--model') ? { model: option('--model') } : {}),
  });
  if (args[0] === 'link' || locked()) {
    try {
      await local('/projects', input);
    } catch (error) {
      throw new Error(
        `Could not link project: ${error instanceof Error ? error.message : 'Background service unavailable'}. Run pdo status to check the service.`,
      );
    }
  } else bindProject(new Store(directory), input);
  console.log(`Linked ${input.name}: ${new URL(input.origin).origin} → ${cwd}`);
} else if (args[0] === 'projects' || (args[0] === 'project' && args[1] === 'list')) {
  console.log(JSON.stringify(config().projects, null, 2));
} else if (args[0] === 'pair') {
  console.log(config().token);
} else if (args[0] === 'status') {
  try {
    await local('/status');
    console.log('PointDOM background service is ready.');
  } catch {
    console.log('PointDOM background service is unavailable. Check the installation.');
    process.exitCode = 1;
  }
} else if (args[0] === 'serve') {
  if (locked()) throw new Error('PointDOM is already running.');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
  const cleanup = () => {
    if (existsSync(lock)) unlinkSync(lock);
  };
  process.on('exit', cleanup);
  const store = new Store(directory);
  store.recover();
  const queue = new Queue(store);
  const server = serve(
    { fetch: createApp(store, queue).fetch, hostname: '127.0.0.1', port: 4318 },
    () => {
      console.log('PointDOM listening on http://127.0.0.1:4318');
    },
  );
  let shuttingDown = false;
  const stop = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    queue.stop();
    server.close();
    setTimeout(() => process.exit(0), 2500).unref();
  };
  server.on('error', (error) => {
    console.error(error.message);
    process.exit(1);
  });
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} else if (['version', '--version', '-v'].includes(args[0] || '')) {
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  console.log(`pdo ${pkg.version}`);
} else {
  if (args.length && !['help', '--help', '-h'].includes(args[0]!)) {
    console.error('Unknown command. Run pdo help.');
    process.exitCode = 1;
  }
  console.log(
    'PointDOM CLI (pdo)\n\n  pdo connect --origin URL  Link project and import MCP into CC Switch\n  pdo connect --json        Print MCP config for manual import\n  pdo connect --app codex   Target Codex (default: opencode)\n  pdo link --origin URL [--model provider/model]  Link the current project\n  pdo pair              Show the local pairing code\n  pdo status            Check the background service\n  pdo projects          List linked projects\n\n  pdo upgrade           Upgrade to the latest release\n  pdo install           Install macOS login startup\n  pdo uninstall         Remove login startup; keep local data\n  pdo serve             Run the service in the foreground\n  pdo help              Show help (-h, --help)\n  pdo version           Show version (-v, --version)',
  );
}
