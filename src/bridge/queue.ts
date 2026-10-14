import { snapshot, prepareCommit, commitJob, type GitSnapshot } from './commit.js';
import { realpathSync } from 'node:fs';
import type { Job, Reply, Submission } from '../shared/contracts.js';
import { terminal } from '../shared/contracts.js';
import { Store } from './store.js';
import { runCodex, type Runner, type Running } from './codex.js';
export class Queue {
  private running?: { id: string; handle: Running };
  constructor(
    readonly store: Store,
    readonly runner: Runner = runCodex,
  ) {}
  submit(input: Submission): Job {
    const existing = this.store.jobs.find((j) => j.id === input.id);
    if (existing) {
      if (
        existing.executor !== input.executor ||
        existing.projectId !== input.projectId ||
        existing.instruction !== input.instruction ||
        JSON.stringify(existing.execution) !== JSON.stringify(input.execution) ||
        JSON.stringify(existing.selections) !== JSON.stringify(input.selections) ||
        JSON.stringify(existing.selection) !== JSON.stringify(input.selection)
      )
        throw new Error('任务 ID 已用于不同请求');
      return existing;
    }
    const project = this.store.project(input.projectId);
    if (
      !project ||
      [input.selection, ...(input.selections || [])].some(
        (item) => !project.origins.includes(new URL(item.url).origin),
      )
    )
      throw new Error('当前网页未绑定该项目');
    if (this.store.jobs.filter((j) => !terminal(j.status)).length >= 30)
      throw new Error('待处理任务过多，请等待现有任务完成');
    const job: Job = {
      ...input,
      status: 'queued',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      events: [],
      result: '',
    };
    this.store.jobs.push(job);
    this.store.saveJobs();
    queueMicrotask(() => this.pump());
    return job;
  }
  private update(job: Job) {
    job.updatedAt = new Date().toISOString();
    this.store.saveJobs();
  }
  wake() {
    this.pump();
  }
  private pump() {
    if (this.running) return;
    const job = this.store.jobs.find(
      (j) =>
        j.status === 'queued' &&
        j.executor !== 'mcp' &&
        !this.store.jobs.some(
          (other) =>
            other.projectId === j.projectId &&
            other.executor === 'mcp' &&
            other.status === 'running',
        ),
    );
    if (!job) return;
    const project = this.store.project(job.projectId);
    if (!project) {
      job.status = 'failed';
      job.error = '绑定项目已移除';
      this.update(job);
      queueMicrotask(() => this.pump());
      return;
    }
    try {
      if (realpathSync(project.cwd) !== project.cwd) throw new Error();
    } catch {
      job.status = 'failed';
      job.error = '项目目录不存在或路径发生变化，请重新绑定';
      this.update(job);
      queueMicrotask(() => this.pump());
      return;
    }
    let before: GitSnapshot | undefined;
    try {
      before = snapshot(project.cwd);
    } catch {
      /* Editing still works without Git. */
    }
    job.status = 'running';
    this.update(job);
    let handle: Running;
    try {
      handle = this.runner(project, job, this.store.config.threads[project.id], {
        event: (text) => {
          job.events.push({ at: new Date().toISOString(), text });
          job.events = job.events.slice(-150);
          this.update(job);
        },
        result: (text) => {
          job.result = (job.result + '\n' + text).trim().slice(-64000);
          this.update(job);
        },
        thread: (id) => {
          job.threadId = id;
          this.store.config.threads[project.id] = id;
          this.store.saveConfig();
          this.update(job);
        },
        approval: (approval) => {
          job.status = 'waiting';
          job.approval = approval;
          this.update(job);
        },
        approved: () => {
          delete job.approval;
          job.status = 'running';
          this.update(job);
        },
      });
    } catch (e) {
      job.status = 'failed';
      job.error = e instanceof Error ? e.message : '启动失败';
      this.update(job);
      queueMicrotask(() => this.pump());
      return;
    }
    this.running = { id: job.id, handle };
    void handle.done
      .then(
        () => {
          if (!terminal(job.status)) {
            job.status = 'completed';
            prepareCommit(project.cwd, before, job);
            if (job.execution?.autoCommit && job.commit?.status === 'ready') {
              try {
                commitJob(project.cwd, job);
              } catch (e) {
                job.commit.status = 'failed';
                job.commit.error = e instanceof Error ? e.message : '提交失败';
              }
            }
          }
        },
        (e) => {
          if (!terminal(job.status)) {
            job.status = 'failed';
            job.error = e instanceof Error ? e.message : '运行失败';
          }
        },
      )
      .finally(() => {
        delete job.approval;
        this.running = undefined;
        this.update(job);
        this.pump();
      });
  }
  commit(id: string) {
    const job = this.store.jobs.find((j) => j.id === id);
    if (!job || job.status !== 'completed') throw new Error('仅已完成任务可以 Commit');
    if (job.commit?.status === 'committed') return job;
    if (
      this.running ||
      this.store.jobs.some((j) => j.status === 'queued' || j.status === 'running')
    )
      throw new Error('请等待修改任务完成后再 Commit');
    const project = this.store.project(job.projectId);
    if (!project) throw new Error('绑定项目已移除');
    try {
      commitJob(project.cwd, job);
    } catch (e) {
      if (job.commit?.status === 'ready' || job.commit?.status === 'failed') {
        job.commit.status = 'failed';
        job.commit.error = e instanceof Error ? e.message : '提交失败';
      }
      this.update(job);
      throw e;
    }
    this.update(job);
    return job;
  }
  cancel(id: string) {
    const job = this.store.jobs.find((j) => j.id === id);
    if (!job) throw new Error('任务不存在');
    if (terminal(job.status)) return;
    job.status = 'cancelled';
    delete job.approval;
    this.update(job);
    if (this.running?.id === id) this.running.handle.cancel();
  }
  reply(id: string, approvalId: string, reply: Reply) {
    const job = this.store.jobs.find((j) => j.id === id);
    if (
      !job ||
      job.status !== 'waiting' ||
      job.approval?.id !== approvalId ||
      this.running?.id !== id
    )
      throw new Error('确认请求已过期');
    this.running.handle.reply(approvalId, reply);
  }
  stop() {
    for (const job of this.store.jobs)
      if (!terminal(job.status) && job.executor !== 'mcp') this.cancel(job.id);
  }
}
