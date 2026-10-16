import { executorSchema } from '../shared/contracts.js';
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { projectSchema, jobSchema, type Job, type Project, terminal } from '../shared/contracts.js';
export const configSchema = z.object({
  version: z.literal(1),
  token: z.string().min(32),
  clients: z.array(z.string()),
  projects: z.array(projectSchema),
  threads: z.record(z.string(), z.string()),
  defaultExecutor: executorSchema.default('mcp'),
  traeAutoSend: z.boolean().optional(),
});
export class Store {
  config: z.infer<typeof configSchema>;
  jobs: Job[];
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    this.config = existsSync(this.path('config.json'))
      ? configSchema.parse(JSON.parse(readFileSync(this.path('config.json'), 'utf8')))
      : {
          version: 1,
          token: randomBytes(32).toString('hex'),
          clients: [],
          projects: [],
          threads: {},
          defaultExecutor: 'mcp',
        };
    this.config.defaultExecutor = 'mcp';
    this.jobs = existsSync(this.path('jobs.json'))
      ? z.array(jobSchema).parse(JSON.parse(readFileSync(this.path('jobs.json'), 'utf8')))
      : [];
    if (!Array.isArray(this.jobs)) throw new Error('任务文件损坏，请从备份恢复');
    this.saveConfig();
  }
  path(name: string) {
    return join(this.directory, name);
  }
  atomic(name: string, value: unknown) {
    const temp = this.path(`${name}.tmp`);
    writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
    chmodSync(temp, 0o600);
    renameSync(temp, this.path(name));
  }
  saveConfig() {
    this.atomic('config.json', this.config);
  }
  saveJobs() {
    this.atomic('jobs.json', this.jobs);
  }
  recover() {
    for (const job of this.jobs)
      if (!terminal(job.status) && !(job.executor === 'mcp' && job.status === 'queued')) {
        job.status = 'interrupted';
        job.error = '本地服务已重启。请检查代码后重新提交，避免重复修改。';
        delete job.approval;
      }
    this.saveJobs();
  }
  project(id: string): Project | undefined {
    return this.config.projects.find((p) => p.id === id);
  }
}
