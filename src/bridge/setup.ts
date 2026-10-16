import { z } from 'zod';
import { extensionSetupInstructions, type ExtensionSetup } from './extension-setup.js';
import { terminalStyle, type Choice } from './terminal.js';
import { connectionLink, type connectionConfig } from './connection.js';
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
        ? 'Merge the copied MCP settings into your existing OpenCode configuration.'
        : agent === 'trae'
          ? 'In Trae, add a custom local MCP server and paste the copied JSON.'
          : 'In your agent, choose Add MCP / local stdio and paste the copied JSON.',
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
  if (
    options.client === 'cc-switch' &&
    options.agent &&
    !['codex', 'claude', 'opencode'].includes(options.agent)
  )
    throw new Error(
      'Use standard MCP for this agent. CC Switch import targets Codex, Claude Code or OpenCode.',
    );
  const { ask, print } = actions;
  const style = terminalStyle(options.color);
  const paint = (code: string, text: string) =>
    options.color ? `\x1b[${code}m${text}\x1b[0m` : text;
  const linkProject = Boolean(options.origin || options.linkProject);
  const step = (number: number, title: string) =>
    print(`\n${paint('36;1', linkProject ? `${number}/3  ${title}` : title)}`);
  const success = (text: string) => print(paint('32', `✓ ${text}`));
  print(
    `${paint('1;32', 'PointDOM')} ${paint('2', '· Setup')}\n${paint('2', 'Your agent. Your model. One MCP connection.')}`,
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

  if (project) step(3, 'Agent');
  const agent =
    options.agent ||
    (options.client === 'opencode'
      ? 'opencode'
      : options.client === 'cc-switch'
        ? setupAgent.parse(options.app)
        : project
          ? setupAgent.parse(await actions.select('Choose your agent', agentChoices))
          : 'generic');
  const label = agentChoices.find((choice) => choice.value === agent)!.label;
  if (project) {
    success(`${label} selected · MCP`);
    const config = actions.config(project);
    if (options.client === 'cc-switch') {
      // CC Switch is a distribution helper, independent of the underlying MCP contract.
      const target = ['codex', 'claude', 'opencode'].includes(agent) ? agent : options.app;
      const link = connectionLink(config, target);
      if (actions.open(link))
        success('CC Switch import requested. Confirm it and enable your app.');
      else print(`Open this CC Switch import link:\n${link}`);
    } else {
      const payload = agentPayload(config, agent);
      if (actions.copy(payload.text)) success('MCP configuration copied');
      else print(`Clipboard unavailable. Use this configuration:\n${payload.text}`);
      print(payload.hint);
      print(
        paint('2', 'Using CC Switch? Rerun with --client cc-switch --app codex|claude|opencode.'),
      );
    }
    print('Restart/reconnect your agent if needed. In the extension, enable access to your site.');
    await ask('Press Enter after enabling the MCP server in your agent: ');
    print(
      'Configure models and permissions in your client. Enable auto-send in PointDOM when ready.',
    );
  }
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
    if (options.agent || options.client) success(`${label} selected`);
    print(`\n${style.heading('Add a project later')}`);
    print(style.muted('  Run in your project directory; use your development URL.'));
    print(`  ${style.action('pdo link --origin http://localhost:3000')}`);
    print(`\n${style.muted('  MCP / client setup (optional):')}`);
    const client = options.client;
    const command =
      client === 'cc-switch'
        ? `pdo connect --client cc-switch --app ${options.app}`
        : client === 'opencode'
          ? 'pdo connect --client opencode --json'
          : 'pdo connect --json';
    print(`  ${style.action(command)}`);
    print(style.muted('  Open your site and enable access in PointDOM.'));
  }
  print(`\n${paint('36;1', 'Pairing code · browser extension only')}`);
  print(actions.pairingCode());
  print(paint('2', 'Keep private. Use only if the extension is not connected.'));

  if (project) print('Daily use: select → submit → review the MCP result.');
  print(`\n${style.muted('Updates: pdo upgrade (CLI/service).')}`);
  print(style.muted('ZIP extension: update manually. See pdo extension --help.'));
}
