import { serve } from '@hono/node-server';
import {
  existsSync,
  realpathSync,
  statSync,
  writeFileSync,
  unlinkSync,
  readFileSync,
} from 'node:fs';
import { resolve, parse } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { Store } from './store.js';
import { Queue } from './queue.js';
import { createApp } from './server.js';
const directory = resolve(process.env.PAGEPATCH_HOME || `${homedir()}/.pagepatch`);
const store = new Store(directory);
const args = process.argv.slice(2);
function option(name: string) {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
const lock = store.path('bridge.pid');
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
if (args[0] === 'project' && args[1] === 'add') {
  if (locked()) throw new Error('请先停止本地服务，再注册项目，随后重新启动');
  const rawPath = option('--path'),
    name = option('--name'),
    rawOrigin = option('--origin');
  if (!rawPath || !name || !rawOrigin)
    throw new Error(
      '用法：project add --name 项目名 --path 绝对目录 --origin http://127.0.0.1:5173',
    );
  if (!name.trim() || name.length > 80) throw new Error('项目名称应为 1–80 个字符');
  const cwd = realpathSync(resolve(rawPath));
  if (!statSync(cwd).isDirectory() || cwd === parse(cwd).root || cwd === homedir())
    throw new Error('请选择具体代码项目，不能绑定根目录或用户目录');
  const url = new URL(rawOrigin);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅支持 http/https 网页');
  const existing = store.config.projects.find((p) => p.cwd === cwd);
  if (existing) {
    existing.name = name;
    if (!existing.origins.includes(url.origin)) existing.origins.push(url.origin);
  } else store.config.projects.push({ id: randomUUID(), name, cwd, origins: [url.origin] });
  store.saveConfig();
  console.log(`已绑定 ${name}：${url.origin} → ${cwd}`);
} else if (args[0] === 'project' && args[1] === 'list') {
  console.log(JSON.stringify(store.config.projects, null, 2));
} else if (args[0] === 'pair') {
  console.log(store.config.token);
} else if (args[0] === 'serve') {
  if (locked()) throw new Error('PagePatch 已在运行');
  writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
  store.recover();
  const queue = new Queue(store);
  const server = serve(
    { fetch: createApp(store, queue).fetch, hostname: '127.0.0.1', port: 4318 },
    () => {
      console.log('PagePatch 已启动：http://127.0.0.1:4318（仅接受已配对扩展）');
      console.log('在另一个终端执行 pnpm cli pair 查看配对码。扩展目录：dist/extension');
    },
  );
  let shuttingDown = false;
  const cleanup = () => {
    if (existsSync(lock)) unlinkSync(lock);
  };
  const stop = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    queue.stop();
    server.close();
    cleanup();
    setTimeout(() => process.exit(0), 500).unref();
  };
  server.on('error', (error) => {
    cleanup();
    console.error(error.message);
    process.exitCode = 1;
  });
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  process.on('exit', cleanup);
} else
  console.log(
    'PagePatch\n  pnpm cli project add --name NAME --path PATH --origin URL\n  pnpm cli project list\n  pnpm cli pair\n  pnpm start',
  );
