import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Hono } from 'hono';
import type { Store } from './store.js';
import { agentContext } from '../shared/agent-context.js';
import { taskProgressSchema } from '../shared/contracts.js';
import { connectionRegistration, type AgentConnections } from './agent-connections.js';
const identity = z.object({ projectId: z.string().uuid(), claim: z.string().uuid() });
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function installAgentRoutes(
  app: Hono,
  store: Store,
  wake: () => void,
  agents: AgentConnections,
) {
  const projectContext = (id: string) => {
    const project = store.project(id);
    return project
      ? { id: project.id, name: project.name, cwd: project.cwd, origins: project.origins }
      : undefined;
  };
  app.post('/api/mcp/connections', async (c) => {
    const input = connectionRegistration.parse(await c.req.json());
    if (!store.project(input.projectId)) return c.json({ error: 'Project not registered.' }, 404);
    return c.json({ connection: agents.register(input) });
  });
  app.post('/api/mcp/connections/disconnect', async (c) => {
    const input = identity.parse(await c.req.json());
    agents.disconnect(input.projectId, input.claim);
    return c.json({ ok: true });
  });
  app.get('/api/mcp/tasks', (c) => {
    const project = store.project(c.req.query('projectId') || '');
    if (!project) return c.json({ error: '项目不存在' }, 404);
    const session = agents.session(project.id, c.req.header('X-PointDOM-Session') || '');
    if (!session)
      return c.json(
        {
          code: 'MCP_RECONNECT_REQUIRED',
          error:
            "PointDOM MCP session is not registered. Restart or reconnect this project's PointDOM MCP server in the current client, then call pointdom_list_tasks again. Finish any claimed work first. Updating files does not update a running MCP process. Verify connection.id in the response before reporting connected.",
        },
        409,
      );
    return c.json({
      project: projectContext(project.id),
      connection: { id: session.id, name: session.name },
      tasks: store.jobs
        .filter(
          (j) =>
            j.executor === 'mcp' && j.projectId === project.id && j.recipient?.id === session.id,
        )
        .slice(-100)
        .reverse()
        .map((j) => ({
          id: j.id,
          instruction: j.instruction,
          status: j.status,
          agent: j.agent,
          recipient: j.recipient,
          createdAt: j.createdAt,
        })),
    });
  });
  app.get('/api/mcp/tasks/:id', (c) => {
    const job = store.jobs.find(
      (j) =>
        j.id === c.req.param('id') &&
        j.projectId === c.req.query('projectId') &&
        j.executor === 'mcp',
    );
    if (!job) return c.json({ error: '任务不存在或不属于此项目' }, 404);
    const session = agents.session(job.projectId, c.req.header('X-PointDOM-Session') || '');
    if (!session || !job.recipient || job.recipient.id !== session.id)
      return c.json({ error: 'Task is not assigned to this MCP session.' }, 404);
    return c.json({
      project: projectContext(job.projectId),
      status: job.status,
      context: agentContext(job),
      result: job.result,
    });
  });
  app.post('/api/mcp/tasks/:id/claim', async (c) => {
    const input = identity
      .extend({ agent: z.string().trim().min(1).max(80) })
      .parse(await c.req.json());
    const job = store.jobs.find(
      (j) => j.id === c.req.param('id') && j.projectId === input.projectId && j.executor === 'mcp',
    );
    if (!job) return c.json({ error: '任务不存在' }, 404);
    if (job.status === 'running' && job.claim === hash(input.claim))
      return c.json({ context: agentContext(job) });
    if (!job.recipient) return c.json({ error: 'Choose an MCP recipient in PointDOM first.' }, 409);
    const session = agents.session(input.projectId, input.claim);
    if (!session || job.recipient.id !== session.id)
      return c.json({ error: 'Task is assigned to a different MCP session.' }, 403);
    if (job.status !== 'queued')
      return c.json({ error: '任务已被领取或已结束，不可重复执行' }, 409);
    if (
      store.jobs.some(
        (other) =>
          other.id !== job.id &&
          other.projectId === job.projectId &&
          ['running', 'waiting'].includes(other.status),
      )
    )
      return c.json({ error: '项目已有执行中的任务，请稍后领取' }, 409);
    job.status = 'running';
    job.agent = session.name;
    job.claim = hash(input.claim);
    job.updatedAt = new Date().toISOString();
    job.startedAt = job.updatedAt;
    job.events.push({ at: job.updatedAt, text: `${session.name} 已领取任务` });
    store.saveJobs();
    return c.json({ project: projectContext(job.projectId), context: agentContext(job) });
  });
  app.post('/api/mcp/tasks/:id/progress', async (c) => {
    const input = identity.extend(taskProgressSchema.shape).parse(await c.req.json());
    const job = store.jobs.find(
      (j) => j.id === c.req.param('id') && j.projectId === input.projectId && j.executor === 'mcp',
    );
    if (!job || job.claim !== hash(input.claim))
      return c.json({ error: '只能更新本会话领取的任务' }, 403);
    if (job.status !== 'running') return c.json({ error: '任务已结束或被取消，请勿继续修改' }, 409);
    const previous = job.events.find((event) => event.progressId === input.stepId);
    if (previous) {
      if (previous.text !== input.message)
        return c.json({ error: '进度步骤 ID 已用于不同内容' }, 409);
      return c.json({ ok: true, at: previous.at });
    }
    if (job.events.filter((event) => event.progressId !== undefined).length >= 200)
      return c.json({ error: '进度记录已达上限，请合并步骤并回报最终结果' }, 429);
    const at = new Date().toISOString();
    job.events.push({ at, text: input.message, progressId: input.stepId });
    job.updatedAt = at;
    store.saveJobs();
    return c.json({ ok: true, at });
  });
  app.post('/api/mcp/tasks/:id/report', async (c) => {
    const input = identity
      .extend({
        outcome: z.enum(['completed', 'failed']),
        summary: z.string().trim().min(1).max(16000),
        files: z.array(z.string().max(1000)).max(100),
        verification: z.string().trim().min(1).max(8000),
      })
      .parse(await c.req.json());
    const job = store.jobs.find(
      (j) => j.id === c.req.param('id') && j.projectId === input.projectId && j.executor === 'mcp',
    );
    if (!job || job.claim !== hash(input.claim))
      return c.json({ error: '只能回写本会话领取的任务' }, 403);
    const result = `${input.summary}\n\n修改文件：\n${input.files.length ? input.files.join('\n') : '未报告文件改动'}\n\n验证：\n${input.verification}`;
    if (job.status === input.outcome && job.result === result) return c.json({ ok: true });
    if (job.status !== 'running') return c.json({ error: '任务已结束或被取消，请勿继续修改' }, 409);
    job.status = input.outcome;
    job.result = result;
    job.updatedAt = new Date().toISOString();
    job.finishedAt = job.updatedAt;
    job.events.push({
      at: job.updatedAt,
      text: `${job.agent} 已回报；文件与验证结果由外部 Agent 提供`,
    });
    store.saveJobs();
    wake();
    return c.json({ ok: true });
  });
}
