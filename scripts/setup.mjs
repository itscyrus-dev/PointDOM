import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
function required(name) {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  if (!value || value.startsWith('--'))
    throw new Error(
      '用法：node scripts/setup.mjs --name 项目名 --project 项目目录 --origin 网页地址',
    );
  return value;
}
const name = required('--name');
const project = realpathSync(required('--project'));
const origin = new URL(required('--origin'));
if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('仅支持 http/https 网页');
if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('需要 Node.js 24 或更新版本');
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
  '\n接下来：\n1. 在 Chrome 加载本仓库的 dist/extension。\n2. 执行 ~/.local/bin/pdo pair，在扩展设置中输入配对码。\n3. 选择“OpenCode CLI”，以后运行项目的 pnpm dev 即可在插件中发送修改。\n其他项目只需在其目录执行 ~/.local/bin/pdo link --origin 网页地址。',
);
