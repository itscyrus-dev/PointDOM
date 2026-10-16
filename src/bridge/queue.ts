import type { Job, Submission } from '../shared/contracts.js';
import { terminal } from '../shared/contracts.js';
import { Store } from './store.js';
import { AgentConnections } from './agent-connections.js';

/** Durable MCP inbox. Only the user's client may claim, execute and report work. */
export class Queue {
  readonly agents = new AgentConnections();
  private stopping = false;
  private settled = new Set<() => void>();
  private stopListeners = new Set<() => void>();
  constructor(readonly store: Store) {}
  get isStopped() {
    return this.stopping;
  }
  onStop(listener: () => void) {
    this.stopListeners.add(listener);
  }
  onSettled(listener: () => void) {
    this.settled.add(listener);
  }
  hasRunningProject(projectId: string) {
    return this.store.jobs.some(
      (job) => job.projectId === projectId && ['running', 'waiting'].includes(job.status),
    );
  }
  submit(input: Submission): Job {
    const { executor: _legacyExecutor, execution: _legacyExecution, ...context } = input;
    const request = { ...context, executor: 'mcp' as const };
    const existing = this.store.jobs.find((job) => job.id === input.id);
    if (existing) {
      if (
        existing.executor !== 'mcp' ||
        existing.projectId !== request.projectId ||
        existing.recipientId !== request.recipientId ||
        existing.instruction !== request.instruction ||
        JSON.stringify(existing.selections) !== JSON.stringify(request.selections) ||
        JSON.stringify(existing.selection) !== JSON.stringify(request.selection)
      )
        throw new Error('任务 ID 已用于不同请求');
      return existing;
    }
    if (this.stopping) throw new Error('PointDOM is stopping. Retry after reconnecting.');
    const recipient = request.recipientId
      ? this.agents.get(request.recipientId, request.projectId)
      : undefined;
    if (request.recipientId && !recipient)
      throw new Error('MCP recipient is not connected to this project.');
    const project = this.store.project(request.projectId);
    if (
      !project ||
      [request.selection, ...(request.selections || [])].some(
        (item) => !project.origins.includes(new URL(item.url).origin),
      )
    )
      throw new Error('当前网页未绑定该项目');
    if (this.store.jobs.filter((job) => !terminal(job.status)).length >= 30)
      throw new Error('待处理任务过多，请等待现有任务完成');
    const now = new Date().toISOString();
    const job: Job = {
      ...request,
      ...(recipient ? { recipient: { id: recipient.id, name: recipient.name } } : {}),
      status: 'queued',
      createdAt: now,
      updatedAt: now,
      events: [],
      result: '',
    };
    this.store.jobs.push(job);
    this.store.saveJobs();
    return job;
  }
  wake() {
    /* Execution is owned by the external MCP client. */
  }
  cancel(id: string) {
    const job = this.store.jobs.find((item) => item.id === id);
    if (!job) throw new Error('任务不存在');
    if (terminal(job.status)) return;
    job.status = 'cancelled';
    delete job.approval;
    job.updatedAt = new Date().toISOString();
    if (job.startedAt) job.finishedAt = job.updatedAt;
    this.store.saveJobs();
    for (const listener of this.settled) listener();
  }
  stop() {
    this.stopping = true;
    for (const listener of this.stopListeners) listener();
  }
}
