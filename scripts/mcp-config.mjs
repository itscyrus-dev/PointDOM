import { existsSync } from 'node:fs';
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
// Accept the legacy option without putting a project in the exported config.
option('--project');
const entry = fileURLToPath(new URL('../dist/bridge/mcp.js', import.meta.url));
if (!existsSync(entry)) throw new Error('Run pnpm build first.');
const server = {
  command: process.execPath,
  args: [entry],
  env: { PAGEPATCH_HOME: home },
};
const output =
  client === 'opencode'
    ? {
        mcp: {
          pointdom: {
            type: 'local',
            command: [server.command, ...server.args],
            environment: server.env,
            enabled: true,
          },
        },
      }
    : { mcpServers: { pointdom: server } };
console.log(JSON.stringify(output, null, 2));
