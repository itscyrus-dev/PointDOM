import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const path = args[args.indexOf('--project') + 1];
if (!args.includes('--project') || !path)
  throw new Error('用法：pnpm mcp:config --project 项目绝对目录');
const cwd = realpathSync(path);
const home = resolve(process.env.PAGEPATCH_HOME || `${homedir()}/.pagepatch`);
const config = JSON.parse(readFileSync(resolve(home, 'config.json'), 'utf8'));
if (!config.projects.some((p) => p.cwd === cwd)) throw new Error('项目尚未注册');
console.log(
  JSON.stringify(
    {
      mcpServers: {
        pagepatch: {
          command: process.execPath,
          args: [
            fileURLToPath(new URL('../dist/bridge/mcp.js', import.meta.url)),
            '--project',
            cwd,
          ],
          env: { PAGEPATCH_HOME: home },
        },
      },
    },
    null,
    2,
  ),
);
