import { cliIdSchema } from '../shared/cli.js';
import { BootstrapGrants, bootstrapGrantSchema, bootstrapPollSchema } from './bootstrap.js';
import { version } from './version.js';
import { bindingSchema, bindProject } from './projects.js';
import { installAgentRoutes } from './agent-api.js';
import { timingSafeEqual } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { submissionSchema, terminal } from '../shared/contracts.js';
import { Store } from './store.js';
import { Queue } from './queue.js';
import { executorSchema } from '../shared/contracts.js';
import { z } from 'zod';
const extensionOrigin = /^chrome-extension:\/\/[a-p]{32}$/;
function matchesToken(actual: string, expected: string) {
  const a = Buffer.from(actual),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function createApp(store: Store, queue: Queue, port = 4318) {
  const app = new Hono();
  const bootstrap = new BootstrapGrants();
  app.use(
    '*',
    bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.json({ error: '请求过大' }, 413) }),
  );
  app.use('*', async (c, next) => {
    if (c.req.header('host') !== `127.0.0.1:${port}`) return c.json({ error: 'Host 不允许' }, 403);
    if (c.req.path.startsWith('/api/mcp/') || c.req.path.startsWith('/api/local/')) {
      if (
        c.req.header('origin') ||
        c.req.header('x-pagepatch-client') ||
        c.req.header(
          c.req.path.startsWith('/api/local/') ? 'x-pagepatch-local' : 'x-pagepatch-mcp',
        ) !== '1' ||
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
    if (c.req.path === '/api/bootstrap') {
      if (!extensionOrigin.test(c.req.header('origin') || ''))
        return c.json({ error: 'Extension Origin required.' }, 403);
      await next();
      return;
    }
    if (!matchesToken(c.req.header('authorization') ?? '', `Bearer ${store.config.token}`))
      return c.json({ error: '配对码不正确，请重新连接' }, 401);
    if (c.req.path !== '/api/pair' && !store.config.clients.includes(origin))
      return c.json({ error: '扩展尚未配对' }, 403);
    await next();
  });
  app.post('/api/local/bootstrap', async (c) => {
    const parsed = bootstrapGrantSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid browser authorization.' }, 400);
    bootstrap.authorize(parsed.data);
    return c.json({ authorized: true });
  });
  app.post('/api/bootstrap', async (c) => {
    const parsed = bootstrapPollSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid connection challenge.' }, 400);
    if (!bootstrap.allows(c.req.header('origin')!, parsed.data.nonce))
      return c.json({ available: true, authorized: false }, 202);
    // Safe retries for lost responses, bound to this origin/challenge for 15 minutes.
    return c.json({ available: true, authorized: true, token: store.config.token });
  });
  let upgradeUntil = 0;
  app.use('*', async (c, next) => {
    if (
      Date.now() < upgradeUntil &&
      c.req.method === 'POST' &&
      (c.req.path === '/api/jobs' ||
        c.req.path.endsWith('/claim') ||
        c.req.path.endsWith('/commit') ||
        c.req.path.endsWith('/handoff'))
    )
      return c.json({ error: 'PointDOM is upgrading. Please retry shortly.' }, 503);
    await next();
  });
  app.post('/api/local/upgrade/prepare', (c) => {
    if (Date.now() < upgradeUntil)
      return c.json({ error: 'Another upgrade is already in progress.' }, 409);
    if (store.jobs.some((job) => !terminal(job.status)))
      return c.json(
        {
          error: 'Tasks are pending or running. Finish or cancel them, then run pdo upgrade again.',
        },
        409,
      );
    upgradeUntil = Date.now() + 60000;
    return c.json({ ok: true });
  });
  app.post('/api/local/upgrade/release', (c) => {
    upgradeUntil = 0;
    return c.json({ ok: true });
  });
  installAgentRoutes(app, store, () => queue.wake(), queue.agents);
  app.get('/api/clis', async (c) =>
    c.json({ clis: await queue.cli.list(c.req.query('refresh') === '1') }),
  );
  app.get('/api/agents', (c) => {
    const projectId = c.req.query('projectId') || '';
    if (!store.project(projectId)) return c.json({ error: 'Project not registered.' }, 404);
    return c.json({ agents: queue.agents.list(projectId) });
  });
  app.post('/api/jobs/:id/recipient', async (c) => {
    const input = z
      .object({ recipientId: z.string().uuid(), expectedRecipientId: z.string().uuid().nullable() })
      .strict()
      .parse(await c.req.json());
    const job = store.jobs.find((job) => job.id === c.req.param('id') && job.executor === 'mcp');
    if (!job) return c.json({ error: 'Task not found.' }, 404);
    if (job.status !== 'queued')
      return c.json({ error: 'Only unclaimed tasks can be reassigned.' }, 409);
    const recipient = queue.agents.get(input.recipientId, job.projectId);
    if (!recipient)
      return c.json({ error: 'MCP recipient is not connected to this project.' }, 409);
    if (job.recipient?.id === recipient.id) return c.json({ job });
    if ((job.recipient?.id || null) !== input.expectedRecipientId)
      return c.json({ error: 'Task recipient changed. Check the current assignment.' }, 409);
    job.recipient = { id: recipient.id, name: recipient.name };
    job.updatedAt = new Date().toISOString();
    job.events.push({ at: job.updatedAt, text: `MCP → ${recipient.name}` });
    store.saveJobs();
    return c.json({ job });
  });
  // Local CLI only: extension/web requests cannot provide filesystem directories.
  app.post('/api/local/projects', async (c) => {
    const input = bindingSchema.parse(await c.req.json());
    return c.json({ project: bindProject(store, input) });
  });
  app.post('/api/local/defaults', async (c) => {
    const input = z
      .object({ executor: executorSchema.optional() })
      .strict()
      .parse(await c.req.json());
    if (input.executor) {
      store.config.defaultExecutor = cliIdSchema.safeParse(input.executor).data || 'codex';
      store.saveConfig();
    }
    return c.json({ ok: true });
  });
  app.get('/api/local/status', (c) =>
    c.json({
      connected: true,
      pid: process.pid,
      bootstrap: true,
      defaultExecutor: cliIdSchema.safeParse(store.config.defaultExecutor).data || 'codex',
      automaticDelivery: true,
      transport: 'cli',
      automaticCommits: false,
    }),
  );

  app.post('/api/pair', (c) => {
    const origin =
      c.req.header('origin') || `chrome-extension://${c.req.header('x-pagepatch-client') || ''}`;
    if (!store.config.clients.includes(origin)) {
      store.config.clients.push(origin);
      store.saveConfig();
    }
    return c.json({
      connected: true,
      version,
      defaultExecutor: cliIdSchema.safeParse(store.config.defaultExecutor).data || 'codex',
    });
  });
  const agentSettings = () => ({
    defaultExecutor: cliIdSchema.safeParse(store.config.defaultExecutor).data || 'codex',
    traeAutoSend: false, // Compatibility only: native client automation is retired.
  });
  app.get('/api/settings', (c) => c.json(agentSettings()));
  app.post('/api/settings', async (c) => {
    const parsed = z
      .object({ executor: executorSchema.optional(), traeAutoSend: z.boolean().optional() })
      .strict()
      .safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Agent 设置格式不正确' }, 400);
    if (parsed.data.traeAutoSend !== undefined)
      return c.json(
        { error: 'Desktop auto-send is retired. Select a local CLI in PointDOM.' },
        410,
      );
    store.config.defaultExecutor = cliIdSchema.parse(parsed.data.executor);
    store.saveConfig();
    return c.json(agentSettings());
  });
  app.get('/api/projects', (c) =>
    c.json({ projects: store.config.projects, agentSettings: agentSettings() }),
  );
  const retiredExecution = (c: Context) =>
    c.json(
      {
        error:
          'Configure accounts, models and permissions in your CLI. PointDOM does not manage Git actions.',
      },
      410,
    );
  app.post('/api/projects/:id/permissions', retiredExecution);
  const retiredDelivery = (c: Context) =>
    c.json(
      {
        error: 'Desktop auto-send is retired. Select a local CLI in PointDOM.',
      },
      410,
    );
  app.post('/api/projects/:id/trae-handoff', retiredDelivery);
  app.post('/api/local/projects/:id/trae-handoff', retiredDelivery);
  app.get('/api/jobs', (c) => {
    const projectId = c.req.query('projectId');
    if (projectId !== undefined) {
      if (!z.string().uuid().safeParse(projectId).success)
        return c.json({ error: 'Invalid project ID.' }, 400);
      if (!store.project(projectId)) return c.json({ error: 'Project not found.' }, 404);
    }
    // Keep the unfiltered response for older clients; scoped clients filter before the cap.
    const jobs =
      projectId === undefined
        ? store.jobs
        : store.jobs.filter((job) => job.projectId === projectId);
    return c.json({ jobs: [...jobs].reverse().slice(0, 100) });
  });
  app.get('/api/jobs/:id', (c) => {
    const job = store.jobs.find((j) => j.id === c.req.param('id'));
    return job ? c.json({ job }) : c.json({ error: '任务不存在' }, 404);
  });
  app.post('/api/jobs', async (c) => {
    const result = submissionSchema.safeParse(await c.req.json());
    if (!result.success) return c.json({ error: '任务格式不正确' }, 400);
    const executor = cliIdSchema.safeParse(result.data.executor);
    if (!executor.success)
      return c.json({ error: 'Choose a CLI executor. MCP submissions are retired.' }, 410);
    if (result.data.execution || result.data.recipientId)
      return c.json(
        {
          error: 'CLI tasks use local CLI settings, without MCP recipients or execution overrides.',
        },
        400,
      );
    const existing = store.jobs.find((job) => job.id === result.data.id);
    if (
      !existing &&
      !(await queue.cli.list()).some((cli) => cli.id === executor.data && cli.available)
    )
      return c.json(
        { error: 'CLI_NOT_FOUND: Install and sign in to the selected CLI, then retry.' },
        409,
      );
    const job = queue.submit(result.data);
    return c.json({ job }, 202);
  });
  app.post('/api/jobs/:id/commit', retiredExecution);
  app.post('/api/jobs/:id/cancel', (c) => {
    queue.cancel(c.req.param('id'));
    return c.json({ ok: true });
  });
  app.post('/api/jobs/:id/handoff', retiredDelivery);
  app.post('/api/jobs/:id/approvals/:approvalId', retiredExecution);
  app.get('/api/models', retiredExecution);
  app.get('/api/status', retiredExecution);
  app.onError((error, c) => c.json({ error: error.message.slice(0, 600) }, 400));
  return app;
}
