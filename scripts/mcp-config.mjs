import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
}
const client = option('--client') || 'cc-switch';
if (!['cc-switch', 'opencode'].includes(client))
  throw new Error('--client must be cc-switch or opencode.');
const home = resolve(process.env.PAGEPATCH_HOME || `${homedir()}/.pagepatch`);
if (!existsSync(resolve(home, 'config.json')))
  throw new Error('Register a project first. See README.md.');
const config = JSON.parse(readFileSync(resolve(home, 'config.json'), 'utf8'));
const path = option('--project');
if (!path && config.projects.length !== 1)
  throw new Error(
    'Use --project with a registered directory; omit it only when exactly one project exists.',
  );
const cwd = realpathSync(path || config.projects[0].cwd);
if (!config.projects.some((p) => p.cwd === cwd)) throw new Error('Project not registered.');
const entry = fileURLToPath(new URL('../dist/bridge/mcp.js', import.meta.url));
if (!existsSync(entry)) throw new Error('Run pnpm build first.');
const server = {
  command: process.execPath,
  args: [entry, '--project', cwd],
  env: { PAGEPATCH_HOME: home },
};
const output =
  client === 'opencode'
    ? {
        mcp: {
          pagepatch: {
            type: 'local',
            command: [server.command, ...server.args],
            environment: server.env,
            enabled: true,
          },
        },
      }
    : { mcpServers: { pagepatch: server } };
console.log(JSON.stringify(output, null, 2));
