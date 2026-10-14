import { installAgentRoutes } from './agent-api.js';
import { timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { replySchema, submissionSchema } from '../shared/contracts.js';
import { Store } from './store.js';
import { Queue } from './queue.js';
import { Rpc, record, catalog } from './codex.js';
const extensionOrigin = /^chrome-extension:\/\/[a-p]{32}$/;
function matchesToken(actual: string, expected: string) {
  const a = Buffer.from(actual),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function createApp(store: Store, queue: Queue) {
  const app = new Hono();
  app.use(
    '*',
    bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.json({ error: '请求过大' }, 413) }),
  );
  app.use('*', async (c, next) => {
    if (c.req.header('host') !== '127.0.0.1:4318') return c.json({ error: 'Host 不允许' }, 403);
    if (c.req.path.startsWith('/api/mcp/')) {
      if (
        c.req.header('origin') ||
        c.req.header('x-pagepatch-client') ||
        c.req.header('x-pagepatch-mcp') !== '1' ||
        !matchesToken(c.req.header('authorization') ?? '', `Bearer ${store.config.token}`)
      )
        return c.json({ error: '仅允许已授权本地 MCP 连接' }, 403);
      c.header('Cache-Control', 'no-store');
      await next();
      return;
    }
    const origin =
      c.req.header('origin') || `chrome-extension://${c.req.header('x-pagepatch-client') || ''}`;
    if (!extensionOrigin.test(origin)) return c.json({ error: '仅允许浏览器扩展连接' }, 403);
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Vary', 'Origin');
    c.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-PagePatch-Client');
    c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    c.header('Cache-Control', 'no-store');
    if (c.req.method === 'OPTIONS') return c.body(null, 204);
    if (!matchesToken(c.req.header('authorization') ?? '', `Bearer ${store.config.token}`))
      return c.json({ error: '配对码不正确，请重新连接' }, 401);
    if (c.req.path !== '/api/pair' && !store.config.clients.includes(origin))
      return c.json({ error: '扩展尚未配对' }, 403);
    await next();
  });
  installAgentRoutes(app, store, () => queue.wake());
  app.post('/api/pair', (c) => {
    const origin =
      c.req.header('origin') || `chrome-extension://${c.req.header('x-pagepatch-client') || ''}`;
    if (!store.config.clients.includes(origin)) {
      store.config.clients.push(origin);
      store.saveConfig();
    }
    return c.json({ connected: true, version: '0.1.0' });
  });
  app.get('/api/projects', (c) => c.json({ projects: store.config.projects }));
  app.get('/api/jobs', (c) => c.json({ jobs: [...store.jobs].reverse().slice(0, 100) }));
  app.get('/api/jobs/:id', (c) => {
    const job = store.jobs.find((j) => j.id === c.req.param('id'));
    return job ? c.json({ job }) : c.json({ error: '任务不存在' }, 404);
  });
  app.post('/api/jobs', async (c) => {
    const result = submissionSchema.safeParse(await c.req.json());
    if (!result.success) return c.json({ error: '任务格式不正确' }, 400);
    const job = queue.submit(result.data);
    return c.json({ job }, 202);
  });
  app.post('/api/jobs/:id/commit', (c) => c.json({ job: queue.commit(c.req.param('id')) }));
  app.post('/api/jobs/:id/cancel', (c) => {
    queue.cancel(c.req.param('id'));
    return c.json({ ok: true });
  });
  app.post('/api/jobs/:id/approvals/:approvalId', async (c) => {
    const result = replySchema.safeParse(await c.req.json());
    if (!result.success) return c.json({ error: '回答格式不正确' }, 400);
    queue.reply(c.req.param('id'), c.req.param('approvalId'), result.data);
    return c.json({ ok: true });
  });
  app.get('/api/models', async (c) => {
    const rpc = new Rpc(process.cwd());
    try {
      await rpc.initialize();
      return c.json({ models: catalog(await rpc.request('model/list', {})) });
    } finally {
      rpc.close();
    }
  });
  app.get('/api/status', async (c) => {
    const rpc = new Rpc(process.cwd());
    try {
      await rpc.initialize();
      const result = record(await rpc.request('account/read', { refreshToken: false }));
      return c.json({
        connected: true,
        codex: true,
        authenticated: !!result.account || result.requiresOpenaiAuth === false,
      });
    } catch (e) {
      return c.json({
        connected: true,
        codex: false,
        error: e instanceof Error ? e.message : 'Codex 不可用',
      });
    } finally {
      rpc.close();
    }
  });
  app.onError((error, c) => c.json({ error: error.message.slice(0, 600) }, 400));
  return app;
}
