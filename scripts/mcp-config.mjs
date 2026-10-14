import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
function option(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} 缺少参数`);
  return value;
}
const client = option('--client') || 'cc-switch';
if (!['cc-switch', 'opencode'].includes(client))
  throw new Error('--client 仅支持 cc-switch 或 opencode');
const home = resolve(process.env.PAGEPATCH_HOME || `${homedir()}/.pagepatch`);
if (!existsSync(resolve(home, 'config.json'))) throw new Error('请先按照 README 注册项目');
const config = JSON.parse(readFileSync(resolve(home, 'config.json'), 'utf8'));
const path = option('--project');
if (!path && config.projects.length !== 1)
  throw new Error('请使用 --project 指定已注册项目的目录；只有一个项目时可省略');
const cwd = realpathSync(path || config.projects[0].cwd);
if (!config.projects.some((p) => p.cwd === cwd)) throw new Error('项目尚未注册');
const entry = fileURLToPath(new URL('../dist/bridge/mcp.js', import.meta.url));
if (!existsSync(entry)) throw new Error('请先执行 pnpm build');
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
