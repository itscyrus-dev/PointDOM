import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { buildPrompt, record, str, type Runner } from './codex.js';
import type { Approval } from '../shared/contracts.js';

// Each task owns an authenticated loopback server and a fresh, project-scoped session.
export const runOpenCode: Runner = (project, job, _priorThread, hooks) => {
  const password = randomBytes(32).toString('hex');
  const child = spawn(
    process.env.PAGEPATCH_OPENCODE_BIN || 'opencode',
    ['serve', '--hostname', '127.0.0.1', '--port', '0', '--pure'],
    {
      cwd: project.cwd,
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        OPENCODE_SERVER_USERNAME: 'opencode',
        OPENCODE_SERVER_PASSWORD: password,
      },
    },
  );
  child.stderr.resume(); // Raw diagnostics can contain provider credentials.
  const controller = new AbortController();
  let base = '',
    session = '',
    settled = false;
  const pending = new Map<string, Approval>();
  let resolveDone!: () => void, rejectDone!: (error: Error) => void;
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  function kill(signal: NodeJS.Signals) {
    try {
      if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch {
      /* Already stopped. */
    }
  }
  function finish(error?: Error) {
    if (settled) return;
    settled = true;
    clearTimeout(startup);
    clearTimeout(timeout);
    controller.abort();
    kill('SIGTERM');
    setTimeout(() => kill('SIGKILL'), 2000).unref();
    if (error) rejectDone(error);
    else resolveDone();
  }
  const startup = setTimeout(
    () => finish(new Error('OpenCode CLI 启动超时，请检查安装与配置')),
    30000,
  );
  const timeout = setTimeout(
    () => finish(new Error('任务超过 45 分钟，已停止。请检查改动后再试。')),
    45 * 60000,
  );
  child.on('error', () =>
    finish(new Error('无法启动 OpenCode CLI，请检查 PAGEPATCH_OPENCODE_BIN 或重新安装后台服务')),
  );
  child.on('exit', (code) => finish(new Error(`OpenCode CLI 已退出 (${code ?? 'signal'})`)));
  function failure(error: unknown) {
    finish(
      error instanceof Error && error.message.startsWith('OpenCode')
        ? error
        : new Error('OpenCode 连接中断，请检查实际改动后重新提交'),
    );
  }
  async function request(path: string, body?: unknown, stream = false) {
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`OpenCode 请求失败 (${response.status})，请检查模型配置与服务版本`);
    return stream ? response : response.json();
  }
  function present() {
    const approval = pending.values().next().value;
    if (approval && !settled) hooks.approval(approval);
  }
  async function events(response: Response) {
    if (!response.body) throw new Error('OpenCode 事件流不可用');
    const lines = createInterface({
      input: Readable.fromWeb(
        response.body as import('node:stream/web').ReadableStream<Uint8Array>,
      ),
    });
    for await (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const event = record(JSON.parse(line.slice(5)));
      const props = record(event.properties);
      if (settled || props.sessionID !== session) continue;
      const id = str(props.id);
      if (event.type === 'permission.asked' || event.type === 'question.asked') {
        if (!id) throw new Error('OpenCode 确认请求缺少 ID');
        const question = event.type === 'question.asked';
        pending.set(id, {
          id,
          kind: question ? 'questions' : props.permission === 'edit' ? 'files' : 'command',
          title: question ? 'OpenCode 需要补充信息' : `OpenCode 请求权限：${str(props.permission)}`,
          details: JSON.stringify(
            { patterns: props.patterns, metadata: props.metadata },
            null,
            2,
          ).slice(0, 12000),
          ...(question
            ? {
                questions: (Array.isArray(props.questions) ? props.questions : []).map(
                  (q, index) => ({
                    id: String(index),
                    question: str(record(q).question),
                    options: (Array.isArray(record(q).options)
                      ? (record(q).options as unknown[])
                      : []
                    ).map((o) => str(record(o).label)),
                  }),
                ),
              }
            : {}),
        });
        if (pending.size === 1) present();
      }
      if (event.type === 'session.error')
        throw new Error('OpenCode 执行失败，请检查供应商、模型和额度配置');
    }
    if (!settled) throw new Error('OpenCode 事件连接中断，请检查改动后重新提交');
  }
  async function run() {
    const created = record(
      await request('/session', {
        title: `PointDOM ${job.id}`,
        permission: [
          { permission: '*', pattern: '*', action: 'ask' },
          ...['read', 'list', 'glob', 'grep'].map((permission) => ({
            permission,
            pattern: '*',
            action: 'allow',
          })),
          { permission: 'external_directory', pattern: '*', action: 'deny' },
        ],
      }),
    );
    if (settled) return;
    session = str(created.id);
    if (!/^ses[a-zA-Z0-9_-]+$/.test(session)) throw new Error('OpenCode 未返回有效会话');
    // Subscribe before submitting so an immediate permission request is never lost.
    const stream = (await request('/event', undefined, true)) as Response;
    void events(stream).catch(failure);
    hooks.event('OpenCode CLI 已启动，正在处理当前项目');
    const model = project.openCodeModel;
    const slash = model?.indexOf('/') ?? -1;
    const response = record(
      await request(`/session/${session}/message`, {
        parts: [{ type: 'text', text: buildPrompt(job) }],
        ...(model
          ? { model: { providerID: model.slice(0, slash), modelID: model.slice(slash + 1) } }
          : {}),
      }),
    );
    if (settled) return;
    if (record(response.info).error)
      throw new Error('OpenCode 模型执行失败，请检查供应商、模型和额度配置');
    const parts = Array.isArray(response.parts) ? response.parts.map(record) : [];
    const text = parts
      .filter((part) => part.type === 'text')
      .map((part) => str(part.text))
      .join('\n');
    if (!text.trim()) throw new Error('OpenCode 未返回执行结果，请检查实际改动');
    hooks.result(text);
    finish();
  }
  const lines = createInterface({ input: child.stdout });
  lines.on('line', (line) => {
    if (base || settled) return;
    const match = line.match(/http:\/\/127\.0\.0\.1:\d+/);
    if (!match) return;
    base = match[0];
    clearTimeout(startup);
    void run().catch(failure);
  });
  return {
    done,
    cancel: () => finish(new Error('任务已停止；已写入的修改不会回滚')),
    reply: (id, reply) => {
      const approval = pending.get(id);
      if (!approval || settled) return;
      const body =
        approval.kind === 'questions'
          ? { answers: approval.questions?.map((question) => [reply.answers?.[question.id] || '']) }
          : { reply: reply.decision === 'accept' ? 'once' : 'reject' };
      const path =
        approval.kind === 'questions' ? `/question/${id}/reply` : `/permission/${id}/reply`;
      void request(path, body)
        .then(() => {
          if (settled) return;
          pending.delete(id);
          hooks.approved();
          present();
        })
        .catch(() => finish(new Error('OpenCode 确认请求失败，请检查实际改动后重新提交')));
    },
  };
};
