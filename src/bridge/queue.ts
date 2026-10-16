import { CliRunner } from './cli-runner.js';
import { cliIdSchema } from '../shared/cli.js';
import type { Job, Submission } from '../shared/contracts.js';
import { terminal } from '../shared/contracts.js';
import { Store } from './store.js';
import { AgentConnections } from './agent-connections.js';

/** Durable inbox: CLI tasks execute locally; old MCP records remain readable. */
export class Queue {
  readonly agents = new AgentConnections();
  private stopping = false;
  private settled = new Set<() => void>();
  private stopListeners = new Set<() => void>();
  private active = new Map<string, AbortController>();
  constructor(
    readonly store: Store,
    readonly cli = new CliRunner(),
  ) {}
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
    const executor = cliIdSchema.safeParse(input.executor);
    const request = { ...context, executor: executor.success ? executor.data : ('mcp' as const) };
    if (executor.success) delete request.recipientId;
    const existing = this.store.jobs.find((job) => job.id === input.id);
    if (existing) {
      if (
        existing.executor !== request.executor ||
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
    this.wake();
    return job;
  }
  wake() {
    if (this.stopping) return;
    for (const job of this.store.jobs) {
      const executor = cliIdSchema.safeParse(job.executor);
      if (
        !executor.success ||
        job.status !== 'queued' ||
        this.hasRunningProject(job.projectId) ||
        [...this.active.keys()].some(
          (id) => this.store.jobs.find((j) => j.id === id)?.projectId === job.projectId,
        )
      )
        continue;
      const project = this.store.project(job.projectId);
      if (!project) continue;
      const controller = new AbortController();
      this.active.set(job.id, controller);
      job.status = 'running';
      job.startedAt = job.updatedAt = new Date().toISOString();
      job.events.push({ at: job.updatedAt, text: 'CLI_STARTING' });
      this.store.saveJobs();
      void this.cli
        .run(executor.data, job, project, controller.signal, (message) => {
          if (job.status !== 'running') return;
          if (job.events.length >= 200) {
            if (job.events.at(-1)?.text !== 'CLI_ACTIVITY_TRUNCATED') {
              job.events.push({ at: new Date().toISOString(), text: 'CLI_ACTIVITY_TRUNCATED' });
              this.store.saveJobs();
            }
            return;
          }
          job.events.push({
            at: new Date().toISOString(),
            text: message.replaceAll(this.store.config.token, '[REDACTED]'),
          });
          this.store.saveJobs();
        })
        .then((result) => {
          if (job.status !== 'running') return;
          job.result = result.replaceAll(this.store.config.token, '[REDACTED]');
          job.status = 'completed';
        })
        .catch((error: unknown) => {
          if (job.status !== 'running') return;
          job.status = 'failed';
          job.error =
            error instanceof Error && /^CLI_[A-Z_]+$/.test(error.message)
              ? error.message
              : 'CLI_FAILED';
        })
        .finally(() => {
          job.finishedAt = job.updatedAt = new Date().toISOString();
          this.active.delete(job.id);
          this.store.saveJobs();
          for (const listener of this.settled) listener();
          this.wake();
        });
    }
  }
  cancel(id: string) {
    const job = this.store.jobs.find((item) => item.id === id);
    if (!job) throw new Error('任务不存在');
    if (terminal(job.status)) return;
    job.status = 'cancelled';
    this.active.get(job.id)?.abort();
    delete job.approval;
    job.updatedAt = new Date().toISOString();
    if (job.startedAt) job.finishedAt = job.updatedAt;
    this.store.saveJobs();
    for (const listener of this.settled) listener();
  }
  stop() {
    this.stopping = true;
    this.agents.clear();
    for (const [id, controller] of this.active) {
      const job = this.store.jobs.find((job) => job.id === id);
      if (job && !terminal(job.status)) {
        job.status = 'interrupted';
        job.error = 'CLI_SERVICE_STOPPED';
      }
      controller.abort();
    }
    this.store.saveJobs();
    for (const listener of this.stopListeners) listener();
  }
}
