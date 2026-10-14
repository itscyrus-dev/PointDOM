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
import { Store } from './store.js';
import { Queue } from './queue.js';
import { createApp } from './server.js';
import { bindingSchema, bindProject } from './projects.js';
import { installService, uninstallService } from './service.js';
const directory = resolve(process.env.PAGEPATCH_HOME || `${homedir()}/.pagepatch`);
const args = process.argv.slice(2);
function option(name: string) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} 缺少参数`);
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
  if (!existsSync(resolve(directory, 'config.json'))) throw new Error('请先安装 PointDOM 后台服务');
  return JSON.parse(readFileSync(resolve(directory, 'config.json'), 'utf8')) as Store['config'];
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
  if (!response.ok) throw new Error(result.error || '本地服务请求失败');
  return result;
}
if (args[0] === 'install') {
  if (locked()) throw new Error('请先停止现有服务，再安装后台启动；这会停止正在执行的任务');
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
    throw new Error('已注册后台启动，但服务未就绪；请检查 pdo status，确认端口 4318 未被占用');
  console.log(`已安装登录后台启动。CLI：${launcher}`);
  console.log(`在项目目录执行：${launcher} link --origin http://localhost:5173`);
} else if (args[0] === 'uninstall') {
  uninstallService();
  console.log('已移除后台启动，项目绑定、配对与修改记录已保留');
} else if (args[0] === 'link' || (args[0] === 'project' && args[1] === 'add')) {
  const cwd = realpathSync(resolve(option('--path') || process.cwd()));
  const input = bindingSchema.parse({
    path: cwd,
    name: option('--name') || basename(cwd),
    origin: option('--origin'),
    ...(option('--model') ? { model: option('--model') } : {}),
  });
  if (args[0] === 'link' || locked()) {
    try {
      await local('/projects', input);
    } catch (error) {
      throw new Error(
        `绑定失败：${error instanceof Error ? error.message : '后台服务不可用'}。请检查 pdo status`,
      );
    }
  } else bindProject(new Store(directory), input);
  console.log(`已绑定 ${input.name}：${new URL(input.origin).origin} → ${cwd}`);
} else if (args[0] === 'projects' || (args[0] === 'project' && args[1] === 'list')) {
  console.log(JSON.stringify(config().projects, null, 2));
} else if (args[0] === 'pair') {
  console.log(config().token);
} else if (args[0] === 'status') {
  try {
    await local('/status');
    console.log('PointDOM 后台服务已就绪');
  } catch {
    console.log('PointDOM 后台服务未连接，请检查安装状态');
    process.exitCode = 1;
  }
} else if (args[0] === 'serve') {
  if (locked()) throw new Error('PagePatch 已在运行');
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
      console.log('PointDOM 已启动：http://127.0.0.1:4318');
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
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
    version: string;
  };
  console.log(`pdo ${pkg.version}`);
} else {
  if (args.length && !['help', '--help', '-h'].includes(args[0]!)) {
    console.error('未知命令，请运行 pdo help');
    process.exitCode = 1;
  }
  console.log(
    'PointDOM CLI (pdo)\n  pdo install                          安装 macOS 后台启动\n  pdo link --origin URL [--model provider/model]  绑定当前项目\n  pdo projects                         列出已绑定项目\n  pdo status                           检查后台服务\n  pdo pair                             显示本机配对码\n  pdo uninstall                        移除后台启动，保留本机状态\n  pdo serve                            前台启动服务\n  pdo help (-h, --help)                 查看帮助\n  pdo version (-v, --version)           查看版本',
  );
}
