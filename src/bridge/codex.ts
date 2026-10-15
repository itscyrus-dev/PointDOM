import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';
import { agentContext } from '../shared/agent-context.js';
import { version } from './version.js';
import type { Approval, Job, Project, Reply, ModelChoice } from '../shared/contracts.js';
export const record = (v: unknown): Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
export const str = (v: unknown) => (typeof v === 'string' ? v : '');
export function catalog(value: unknown): ModelChoice[] {
  const data = record(value).data;
  return (Array.isArray(data) ? data : []).map(record).map((m) => ({
    model: str(m.model),
    name: str(m.displayName) || str(m.model),
    isDefault: m.isDefault === true,
    efforts: (Array.isArray(m.supportedReasoningEfforts) ? m.supportedReasoningEfforts : [])
      .map((e) => str(record(e).reasoningEffort))
      .filter(Boolean),
    defaultEffort: str(m.defaultReasoningEffort),
    tiers: (Array.isArray(m.serviceTiers) ? m.serviceTiers : []).map((t) => ({
      id: str(record(t).id),
      name: str(record(t).name),
    })),
  }));
}
export interface RunnerHooks {
  event: (text: string) => void;
  result: (text: string) => void;
  thread: (id: string) => void;
  approval: (approval: Approval) => void;
  approved: () => void;
}
export interface Running {
  done: Promise<void>;
  cancel: () => void;
  reply: (id: string, reply: Reply) => void;
}
export type Runner = (
  project: Project,
  job: Job,
  threadId: string | undefined,
  hooks: RunnerHooks,
) => Running;

export class Rpc {
  private next = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  onMessage: (message: Record<string, unknown>) => void = () => {};
  onExit: (error: Error) => void = () => {};
  readonly process: ChildProcessWithoutNullStreams;
  private stopped = false;
  constructor(cwd: string) {
    this.process = spawn(
      process.env.PAGEPATCH_CODEX_BIN || 'codex',
      ['app-server', '--listen', 'stdio://'],
      { cwd, stdio: ['pipe', 'pipe', 'pipe'], shell: false },
    );
    this.process.stderr.resume(); // Never expose raw diagnostics or credentials to web content.
    const lines = createInterface({ input: this.process.stdout });
    lines.on('line', (line) => {
      try {
        const message = record(JSON.parse(line));
        if (typeof message.id === 'number' && !message.method) {
          const pending = this.pending.get(message.id);
          if (!pending) return;
          clearTimeout(pending.timer);
          this.pending.delete(message.id);
          if (message.error)
            pending.reject(new Error(str(record(message.error).message) || 'Codex 请求失败'));
          else pending.resolve(message.result);
        } else this.onMessage(message);
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error('Codex 协议解析失败'));
      }
    });
    this.process.on('error', (e) => this.fail(e));
    this.process.on('exit', (code) => this.fail(new Error(`Codex 进程结束 (${code ?? 'signal'})`)));
  }
  private fail(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    if (!this.stopped) this.onExit(error);
  }
  send(message: unknown) {
    if (!this.process.stdin.destroyed) this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }
  request(method: string, params: unknown = {}): Promise<unknown> {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      if (this.stopped || this.process.stdin.destroyed) {
        reject(new Error('Codex 连接已关闭'));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex 请求超时：${method}`));
      }, 60_000);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  async initialize() {
    await this.request('initialize', {
      clientInfo: { name: 'pointdom', title: 'PointDOM', version },
    });
    this.send({ method: 'initialized' });
  }
  close() {
    this.stopped = true;
    this.fail(new Error('连接已关闭'));
    this.process.stdin.end();
    this.process.kill();
    const timer = setTimeout(() => this.process.kill('SIGKILL'), 2000);
    timer.unref();
  }
}

export function buildPrompt(job: Job) {
  return `The user explicitly submitted a source-code change request for this linked project. Apply it in the current workspace and verify the result.

${JSON.stringify(agentContext(job), null, 2)}

Read AGENTS.md and the relevant design rules before editing. Use the exact selected element and its structural context to locate the correct source component and instance. Do not treat a temporary browser DOM change as completion. Preserve existing work and stay within this project. Report actual files, verification and limitations in the user's language. Never claim to have inspected a browser view you did not access.`;
}

export const runCodex: Runner = (project, job, _priorThread, hooks) => {
  const rpc = new Rpc(project.cwd);
  let threadId = '';
  let turnId = '';
  let settled = false;
  const pendingApprovals = new Map<
    string,
    { rpcId: unknown; method: string; questions?: Approval['questions']; approval: Approval }
  >();
  let resolveDone: () => void = () => {};
  let rejectDone: (e: Error) => void = () => {};
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  const timeout = setTimeout(
    () => finish(new Error('任务超过 45 分钟，已停止。请检查改动后再试。')),
    45 * 60_000,
  );
  function finish(error?: Error) {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    rpc.close();
    if (error) rejectDone(error);
    else resolveDone();
  }
  rpc.onExit = finish;
  rpc.onMessage = (message) => {
    const method = str(message.method);
    const params = record(message.params);
    if (message.id !== undefined) {
      const id = randomUUID();
      let approval: Approval | undefined;
      if (
        method === 'item/commandExecution/requestApproval' ||
        method === 'item/fileChange/requestApproval'
      ) {
        approval = {
          id,
          kind: method.includes('commandExecution') ? 'command' : 'files',
          title: method.includes('commandExecution') ? 'Codex 请求执行命令' : 'Codex 请求修改文件',
          details: [str(params.reason), str(params.command), str(params.cwd), str(params.grantRoot)]
            .filter(Boolean)
            .join('\n')
            .slice(0, 12000),
        };
      } else if (method === 'item/tool/requestUserInput') {
        const questions = Array.isArray(params.questions) ? params.questions.map(record) : [];
        if (questions.some((q) => q.isSecret)) {
          rpc.send({
            id: message.id,
            error: { code: -32601, message: 'Secret entry is not supported in this client' },
          });
          return;
        }
        approval = {
          id,
          kind: 'questions',
          title: '需要补充信息',
          details: '',
          questions: questions.map((q) => ({
            id: str(q.id),
            question: str(q.question),
            options: Array.isArray(q.options) ? q.options.map((o) => str(record(o).label)) : [],
          })),
        };
      }
      if (approval) {
        pendingApprovals.set(id, {
          rpcId: message.id,
          method,
          questions: approval.questions,
          approval,
        });
        if (pendingApprovals.size === 1) hooks.approval(approval);
      } else {
        rpc.send({
          id: message.id,
          error: { code: -32601, message: 'Unsupported client request; no permission granted' },
        });
        hooks.event(`未授予不支持的请求：${method}`);
      }
      return;
    }
    if (params.threadId !== threadId || !threadId) return;
    if (method === 'turn/started') turnId = str(record(params.turn).id);
    if (method === 'item/started') {
      const item = record(params.item);
      const label = (
        {
          commandExecution: '执行检查',
          fileChange: '修改文件',
          agentMessage: '分析与反馈',
          reasoning: '分析中',
        } as Record<string, string>
      )[str(item.type)];
      if (label) hooks.event(label + (item.command ? `：${str(item.command).slice(0, 500)}` : ''));
    }
    if (method === 'item/completed') {
      const item = record(params.item);
      if (item.type === 'agentMessage') hooks.result(str(item.text));
      if (item.type === 'fileChange' && Array.isArray(item.changes))
        for (const change of item.changes) hooks.event(`文件：${str(record(change).path)}`);
    }
    if (method === 'turn/completed') {
      const turn = record(params.turn);
      if (turn.status === 'completed') finish();
      else
        finish(new Error(str(record(turn.error).message) || `任务${str(turn.status) || '失败'}`));
    }
    if (method === 'error' && params.willRetry !== true)
      finish(new Error(str(record(params.error).message) || 'Codex 执行失败'));
  };
  void (async () => {
    try {
      await rpc.initialize();
      // A fresh task inherits the CLI configuration, without replaying legacy UI overrides.
      const permissionOptions =
        job.permissions?.confirmation === 'reduced' ? { approvalPolicy: 'on-request' } : {};
      const options = {
        cwd: project.cwd,
        sandbox: 'workspace-write',
        approvalsReviewer: 'user',
        ...permissionOptions,
      };
      const response = record(await rpc.request('thread/start', options));
      threadId = str(record(response.thread).id);
      if (!threadId) throw new Error('Codex 未返回会话 ID');
      hooks.thread(threadId);
      if (settled) return;
      const responseTurn = record(
        await rpc.request('turn/start', {
          threadId,
          input: [{ type: 'text', text: buildPrompt(job), text_elements: [] }],
          cwd: project.cwd,
          ...permissionOptions,
          sandboxPolicy: {
            type: 'workspaceWrite',
            writableRoots: [project.cwd],
            networkAccess: job.permissions?.codexNetwork === true,
            excludeTmpdirEnvVar: true,
            excludeSlashTmp: true,
          },
        }),
      );
      turnId = str(record(responseTurn.turn).id);
    } catch (e) {
      finish(e instanceof Error ? e : new Error('Codex 启动失败'));
    }
  })();
  return {
    done,
    cancel() {
      if (threadId && turnId)
        rpc.send({ id: Date.now(), method: 'turn/interrupt', params: { threadId, turnId } });
      finish(new Error('用户停止了任务'));
    },
    reply(id, reply) {
      const request = pendingApprovals.get(id);
      if (!request) throw new Error('确认请求已失效');
      let result: unknown;
      if (request.method === 'item/tool/requestUserInput') {
        const answers: Record<string, { answers: string[] }> = {};
        for (const q of request.questions ?? []) {
          const answer = reply.answers?.[q.id]?.trim();
          if (!answer) throw new Error('请回答所有问题');
          answers[q.id] = { answers: [answer] };
        }
        result = { answers };
      } else {
        if (!reply.decision) throw new Error('请选择允许或拒绝');
        result = { decision: reply.decision };
      }
      rpc.send({ id: request.rpcId, result });
      pendingApprovals.delete(id);
      hooks.approved();
      const next = pendingApprovals.values().next().value;
      if (next) hooks.approval(next.approval);
    },
  };
};
