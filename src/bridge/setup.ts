import { z } from 'zod';
import { extensionSetupInstructions, type ExtensionSetup } from './extension-setup.js';
import { terminalStyle, type Choice } from './terminal.js';
import { type connectionConfig } from './connection.js';
import { projectDirectory } from './projects.js';

type Config = ReturnType<typeof connectionConfig>;
export const setupAgent = z.enum(['generic', 'codex', 'claude', 'opencode', 'trae', 'other']);
export type SetupAgent = z.infer<typeof setupAgent>;
export const agentChoices: readonly Choice[] = [
  { value: 'generic', label: 'Generic MCP (default)' },
  { value: 'codex', label: 'Codex' },
  { value: 'claude', label: 'Claude Code' },
  { value: 'opencode', label: 'OpenCode' },
  { value: 'trae', label: 'Trae' },
  { value: 'other', label: 'Other MCP client' },
];
export type SetupClient = 'standard' | 'cc-switch' | 'opencode';
export interface SetupActions {
  ask: (question: string) => Promise<string>;
  print: (message: string) => void;
  select: (question: string, choices: readonly Choice[]) => Promise<string>;
  project: () => Promise<string>;
  bind: (origin: string, project: string) => Promise<void>;
  extension: () => ExtensionSetup;
  pairingCode: () => string;
  config: (project: string) => Config;
  copy: (text: string) => boolean;
  open: (url: string) => boolean;
}
export async function chooseProjectDirectory(
  actions: Pick<SetupActions, 'ask' | 'print'>,
  initial = process.cwd(),
  explicit = false,
) {
  if (explicit) return projectDirectory(initial);
  let fallback = '';
  try {
    fallback = projectDirectory(initial);
  } catch {
    actions.print('Choose the project folder that contains your source code.');
  }
  for (;;) {
    const input = (
      await actions.ask(`Project directory${fallback ? ` [${fallback}]` : ''}: `)
    ).trim();
    try {
      return projectDirectory(input || fallback, initial);
    } catch (error) {
      actions.print(
        `Error: ${error instanceof Error ? error.message : 'Invalid project directory.'}`,
      );
    }
  }
}
export function clientConfig(config: Config, client: SetupClient) {
  const [id, server] = Object.entries(config.mcpServers)[0]!;
  return client === 'opencode'
    ? {
        mcp: {
          [id]: {
            type: 'local',
            command: [server.command, ...server.args],
            environment: server.env,
            enabled: true,
          },
        },
      }
    : config;
}

export function agentPayload(config: Config, agent: SetupAgent) {
  return {
    text: JSON.stringify(
      clientConfig(config, agent === 'opencode' ? 'opencode' : 'standard'),
      null,
      2,
    ),
    hint:
      agent === 'opencode'
        ? 'Merge the copied pointdom MCP entry once into your OpenCode user-level configuration.'
        : agent === 'trae'
          ? 'In your Trae Agent window, add the pointdom local MCP server once and paste the copied JSON.'
          : 'In your agent user-level settings, choose Add MCP / local stdio and paste the copied JSON once.',
  };
}

/** Interactive local setup. Display the pairing code only for the user, never in exported settings. */
export async function guidedSetup(
  actions: SetupActions,
  options: {
    origin?: string;
    linkProject?: boolean;
    client?: SetupClient;
    app: string;
    agent?: SetupAgent;
    color?: boolean;
  },
) {
  const { ask, print } = actions;
  const style = terminalStyle(options.color);
  const paint = (code: string, text: string) =>
    options.color ? `\x1b[${code}m${text}\x1b[0m` : text;
  const linkProject = Boolean(options.origin || options.linkProject);
  const step = (number: number, title: string) =>
    print(`\n${paint('36;1', linkProject ? `${number}/2  ${title}` : title)}`);
  const success = (text: string) => print(paint('32', `✓ ${text}`));
  print(
    `${paint('1;32', 'PointDOM')} ${paint('2', '· Setup')}\n${paint('2', 'Your CLI. Your project. Submit and run.')}`,
  );
  let project: string | undefined;
  let url: URL | undefined;
  if (linkProject) {
    step(1, 'Project');
    project = await actions.project();
    print(`Project directory: ${project}`);
    const raw =
      options.origin ||
      (await ask('Development site URL [http://localhost:5173]: ')).trim() ||
      'http://localhost:5173';
    url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new Error('Enter an http/https development URL without credentials.');
    await actions.bind(url.origin, project);
    success(`Project linked to ${url.origin}`);
  }
  step(linkProject ? 2 : 1, 'Browser');

  const paired = (await ask(`Extension already connected? ${style.action('[y/N]')}: `))
    .trim()
    .toLowerCase();
  if (!['y', 'yes'].includes(paired)) {
    const setup = actions.extension();
    for (const line of extensionSetupInstructions(setup, 'install', options.color)) print(line);
    await ask(`\n  PointDOM visible? Press ${style.action('Enter')} to continue: `);
    print(`\n${style.heading('Pair extension')}\n`);
    if (actions.copy(actions.pairingCode())) print(`  ${style.success('✓ Pairing code copied')}`);
    else {
      print('  Clipboard unavailable. Copy this code into PointDOM:');
      print(actions.pairingCode());
    }
    print(`  Open PointDOM → paste code → ${style.action('Connect')}`);
    await ask(`\n  Connected? Press ${style.action('Enter')} to continue: `);
  }

  print('Install and sign in to Codex, Claude Code, OpenCode or Trae CLI.');
  print(
    'In PointDOM, choose your CLI beside Submit. Submissions run automatically in the linked project.',
  );
  if (url) {
    print(
      actions.open(url.origin)
        ? `Project page requested: ${url.origin}`
        : `Open your project page: ${url.origin}`,
    );
    print(
      'On that page, open PointDOM, enable project page access and confirm the Chrome permission prompt.',
    );
  }
  print(`\n${style.success('✓ Setup steps finished')}`);
  if (!project) {
    print(`\n${style.heading('Add a project later')}`);
    print(style.muted('  Run in your project directory; use your development URL.'));
    print(`  ${style.action('pdo link --origin http://localhost:3000')}`);
    print(style.muted('  Open your site and enable access in PointDOM.'));
  }
  print(`\n${paint('36;1', 'Pairing code · browser extension only')}`);
  print(actions.pairingCode());
  print(paint('2', 'Keep private. Use only if the extension is not connected.'));

  if (project) print('Daily use: select → submit → review the result.');
  print(`\n${style.muted('Updates: pdo upgrade (CLI/service).')}`);
  print(style.muted('ZIP extension: update manually. See pdo extension --help.'));
}
