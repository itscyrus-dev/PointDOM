import { z } from 'zod';
import { bootstrapGrantSchema } from './bootstrap.js';
import { askLine, selectChoice, terminalColor } from './terminal.js';
import {
  guidedSetup,
  chooseProjectDirectory,
  clientConfig,
  setupAgent,
  type SetupClient,
} from './setup.js';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  extensionArchive,
  extensionSetupDirectory,
  openExtensionSetup,
  extensionSetupInstructions,
} from './extension-setup.js';
import { upgrade } from './upgrade.js';
import { activateRelease, validateRelease } from './release-paths.js';
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
import { Store, configSchema } from './store.js';
import { Queue } from './queue.js';
import { createApp } from './server.js';
import { bindingSchema, bindProject } from './projects.js';
import { installService, uninstallService, startService } from './service.js';
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
  try {
    return configSchema.parse(JSON.parse(readFileSync(resolve(directory, 'config.json'), 'utf8')));
  } catch {
    throw new Error(
      'PointDOM configuration could not be read. Preserve your data and check the installation.',
    );
  }
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
function copyToClipboard(text: string) {
  if (process.platform !== 'darwin') return false;
  try {
    execFileSync('/usr/bin/pbcopy', [], { input: text, stdio: 'pipe', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}
function openLink(url: string) {
  if (process.platform !== 'darwin') return false;
  try {
    execFileSync('/usr/bin/open', [url], { stdio: 'pipe', timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}
async function main() {
  if (args[0] === 'setup') {
    if (args.includes('--help') || args.includes('-h'))
      console.log(
        'pdo setup [--origin URL] [--path PATH] [--client standard|cc-switch|opencode] [--app opencode|codex|claude] [--agent generic|codex|claude|opencode|trae|other]\nLoad and pair the browser extension. Add --origin URL or --path PATH to also link a project. Requires an interactive terminal.',
      );
    else {
      try {
        if (!process.stdin.isTTY || !process.stdout.isTTY)
          throw new Error(
            'Run pdo setup in an interactive terminal. For scripting use pdo connect --origin URL --json.',
          );
        const path = option('--path');
        const client = option('--client');
        if (client && !['standard', 'cc-switch', 'opencode'].includes(client))
          throw new Error('Unknown MCP client.');
        const app = connectionApp.parse(option('--app') || 'opencode');
        const color = terminalColor();
        const agent = option('--agent') ? setupAgent.parse(option('--agent')) : undefined;
        await guidedSetup(
          {
            ask: askLine,
            select: (question, choices) => selectChoice(question, choices, color),
            print: (message) => console.log(message),
            project: () =>
              chooseProjectDirectory(
                { ask: askLine, print: console.log },
                path || process.cwd(),
                path !== undefined,
              ),
            bind: async (origin, cwd) => {
              await local(
                '/projects',
                bindingSchema.parse({ path: cwd, name: basename(cwd), origin }),
              );
            },
            extension: () => {
              const path = extensionArchive(import.meta.url);
              return {
                path,
                format: 'zip',
                platform: process.platform,
                ...openExtensionSetup(path, process.platform, undefined, 'zip'),
              };
            },
            pairingCode: () => config().token,
            config: () =>
              connectionConfig(directory, fileURLToPath(new URL('./mcp.js', import.meta.url))),
            copy: copyToClipboard,
            open: openLink,
          },
          {
            origin: option('--origin'),
            linkProject: path !== undefined,
            client: client as SetupClient | undefined,
            app,
            agent,
            color,
          },
        );
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'SETUP_CANCELLED') {
          console.log(error.message);
          process.exitCode = 130;
        } else {
          console.error(`Error: ${error instanceof Error ? error.message : 'Setup failed.'}`);
          process.exitCode = 1;
        }
      }
    }
  } else if (args[0] === 'extension') {
    if (args.some((arg) => ['-h', '--help'].includes(arg))) {
      console.log(
        'pdo extension         Open extension folder and Chrome setup; copy the folder path (macOS).',
      );
      console.log(
        'pdo extension --path  Print the extension path without opening apps or changing the clipboard.',
      );
      console.log('pdo extension --reload  Open Chrome and show how to reload after upgrading.');
      console.log(
        'pdo extension --zip  Create a standalone extension ZIP for manual installation.',
      );
    } else {
      if (
        args.slice(1).some((arg) => !['--path', '--reload', '--zip'].includes(arg)) ||
        ['--path', '--reload', '--zip'].filter((flag) => args.includes(flag)).length > 1
      )
        throw new Error('Usage: pdo extension [--path | --reload | --zip]');
      if (args.includes('--zip')) {
        const path = extensionArchive(import.meta.url);
        for (const line of extensionSetupInstructions(
          {
            path,
            format: 'zip',
            platform: process.platform,
            ...openExtensionSetup(path, process.platform, undefined, 'zip'),
          },
          'install',
          terminalColor(),
        ))
          console.log(line);
      } else {
        const path = extensionSetupDirectory(import.meta.url, !args.includes('--path'));
        if (args.includes('--path')) console.log(path);
        else {
          const mode = args.includes('--reload') ? 'reload' : 'install';
          const result = openExtensionSetup(path, process.platform, undefined, mode);
          console.log(
            mode === 'reload' ? 'PointDOM extension update\n' : 'PointDOM extension setup\n',
          );
          for (const line of extensionSetupInstructions(
            { path, platform: process.platform, ...result },
            mode,
          ))
            console.log(line);
        }
      }
    }
  } else if (args[0] === 'upgrade') {
    await upgrade(fileURLToPath(import.meta.url));
  } else if (args[0] === 'upgrade-stop') {
    // Internal installer handshake: the bridge atomically refuses active work and
    // pauses new task submissions/claims until it is stopped or the lease expires.
    await local('/upgrade/prepare', {});
    try {
      await uninstallService(directory);
    } catch (error) {
      await local('/upgrade/release', {}).catch(() => {});
      throw error;
    }
  } else if (args[0] === 'handoff') {
    throw new Error(
      'Desktop auto-send is retired. Connect your agent through pdo connect --json and use PointDOM MCP tools.',
    );
  } else if (args[0] === 'connect') {
    const app = connectionApp.parse(option('--app') || 'opencode');
    const client =
      option('--client') || (option('--app') || args.includes('--url') ? 'cc-switch' : 'standard');
    if (!['standard', 'cc-switch', 'opencode'].includes(client))
      throw new Error('--client must be standard, cc-switch or opencode.');
    const cwd = realpathSync(resolve(option('--path') || process.cwd()));
    const origin = option('--origin');
    if (origin) {
      const input = bindingSchema.parse({ path: cwd, name: basename(cwd), origin });
      await local('/projects', input);
    }
    const exported = connectionConfig(
      directory,
      fileURLToPath(new URL('./mcp.js', import.meta.url)),
    );
    if (client === 'standard' || client === 'opencode' || args.includes('--json')) {
      const output = clientConfig(exported, client as SetupClient);
      console.log(JSON.stringify(output, null, 2));
      if (!args.includes('--json'))
        console.error(
          'Add this local stdio MCP to your agent. Enable it, submit a browser annotation, then ask the agent to process pending PointDOM tasks.',
        );
    } else {
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
          'In the browser extension, select Agent (MCP), submit an annotation, then ask your agent to process pending PointDOM tasks.',
        );
        console.log(
          'Reconnect your agent after updates. Older version-specific PointDOM entries need a one-time re-import.',
        );
      }
    }
  } else if (args[0] === 'install') {
    if (locked())
      throw new Error(
        'Stop the existing service before installing login startup. This will stop active tasks.',
      );
    validateRelease(import.meta.url);
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
    activateRelease(import.meta.url);
    if (!args.includes('--quiet')) {
      console.log(`PointDOM background service is ready. CLI: ${launcher}`);
      console.log(
        'Next: run pdo setup to connect the browser extension. Add projects later with pdo link.',
      );
    }
  } else if (args[0] === 'start') {
    startService(directory);
    console.log('Background service start requested.');
  } else if (args[0] === 'uninstall') {
    await uninstallService(directory);
    console.log(
      'Background service removed. Project bindings, pairing and task history were preserved.',
    );
  } else if (args[0] === 'link' || (args[0] === 'project' && args[1] === 'add')) {
    const cwd = realpathSync(resolve(option('--path') || process.cwd()));
    const input = bindingSchema.parse({
      path: cwd,
      name: option('--name') || basename(cwd),
      origin: option('--origin'),
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
    if (args.includes('--help') || args.includes('-h')) {
      console.log('pdo pair [--copy | --extension-id ID --challenge HASH]');
    } else if (args.includes('--extension-id') || args.includes('--challenge')) {
      if (args.length !== 5) throw new Error('Invalid connection options. Run pdo pair --help.');
      const grant = bootstrapGrantSchema.safeParse({
        extensionId: option('--extension-id'),
        challenge: option('--challenge'),
      });
      if (!grant.success)
        throw new Error(
          'Invalid extension connection command. Copy it again from PointDOM settings.',
        );
      await local('/bootstrap', grant.data);
      console.log('Browser authorized. Return to PointDOM; it will connect automatically.');
    } else if (args.length === 2 && args[1] === '--copy') {
      if (!copyToClipboard(config().token))
        throw new Error('Clipboard unavailable. Run pdo pair to display the code locally.');
      console.log('Pairing code copied. Paste it into the browser extension and click Connect.');
    } else if (args.length === 1) console.log(config().token);
    else throw new Error('Unknown pairing options. Run pdo pair --help.');
  } else if (args[0] === 'status') {
    try {
      const status = await local('/status');
      console.log(
        args.includes('--json') ? JSON.stringify(status) : 'PointDOM background service is ready.',
      );
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
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as {
      version: string;
    };
    console.log(`pdo ${pkg.version}`);
  } else {
    if (args.length && !['help', '--help', '-h'].includes(args[0]!)) {
      console.error('Unknown command. Run pdo help.');
      process.exitCode = 1;
    }
    console.log(
      'PointDOM CLI (pdo)\n\n  pdo setup             Load and pair the browser extension\n  pdo connect --origin URL  Link project and export universal MCP config\n  pdo connect --json        Print MCP config for any local stdio client\n  pdo connect --client cc-switch  Open CC Switch import (default target: opencode)\n  pdo connect --client opencode   Print native OpenCode MCP config\n  pdo connect --app codex   Import into CC Switch for Codex\n  pdo link --origin URL  Link the current project\n  pdo extension         Open Chrome extension setup\n  pdo extension --path  Print the installed extension path\n  pdo extension --zip   Export a standalone ZIP for manual installation\n  pdo extension --reload  Open Chrome update instructions\n  pdo pair              Show the local pairing code\n  pdo pair --copy       Copy pairing code without printing it\n  pdo start             Start the installed background service\n  pdo status            Check the background service\n  pdo projects          List linked projects\n\n  pdo upgrade           Upgrade to the latest published release\n  pdo install           Install per-user login startup\n  pdo uninstall         Remove login startup; keep local data\n  pdo serve             Run the service in the foreground\n  pdo help              Show help (-h, --help)\n  pdo version           Show version (-v, --version)',
    );
  }
}
void main().catch((error: unknown) => {
  console.error(
    `Error: ${error instanceof z.ZodError ? 'Invalid options. Run pdo help.' : error instanceof Error && !(error instanceof SyntaxError) ? error.message : 'Command failed. Run pdo status to check the local service.'}`,
  );
  process.exitCode = 1;
});
