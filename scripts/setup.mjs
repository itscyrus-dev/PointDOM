import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
function required(name) {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (!value || value.startsWith('--'))
    throw new Error('Usage: node scripts/setup.mjs --name NAME --project PATH --origin URL');
  return value;
}
const name = required('--name');
const project = realpathSync(required('--project'));
const origin = new URL(required('--origin'));
if (!['http:', 'https:'].includes(origin.protocol))
  throw new Error('Only http/https development URLs are supported.');
if (Number(process.versions.node.split('.')[0]) < 24)
  throw new Error('Node.js 24 or newer is required.');
const cwd = fileURLToPath(new URL('..', import.meta.url));
function run(command, parameters) {
  const result = spawnSync(command, parameters, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run('pnpm', ['install', '--frozen-lockfile']);
run('pnpm', ['build']);
run(process.execPath, ['dist/bridge/main.js', 'install']);
run(process.execPath, [
  'dist/bridge/main.js',
  'link',
  '--name',
  name,
  '--path',
  project,
  '--origin',
  origin.origin,
]);
console.log(
  'Next: run pdo extension, then pdo pair to connect the browser. Run pdo connect from your project and add its MCP configuration to your agent. Submit annotations in Agent (MCP) mode and ask the agent to process them.',
);
