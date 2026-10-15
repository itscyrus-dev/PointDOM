import { query, type PermissionResult, type Query } from '@anthropic-ai/claude-agent-sdk';
import { accessSync, constants } from 'node:fs';
import { delimiter, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildPrompt, record, str, type Runner } from './codex.js';
import { insideProject } from './acp.js';
import type { Approval } from '../shared/contracts.js';

function binary() {
  const explicit = process.env.PAGEPATCH_CLAUDE_BIN;
  const candidates = explicit
    ? [resolve(explicit)]
    : (process.env.PATH || '').split(delimiter).map((path) => resolve(path, 'claude'));
  const found = candidates.find((path) => {
    try {
      accessSync(path, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
  if (!found)
    throw new Error('未找到 Claude Code CLI，请安装并登录 claude，或设置 PAGEPATCH_CLAUDE_BIN');
  return found;
}

export function claudeRunner(start: typeof query = query): Runner {
  return (project, job, _prior, hooks) => {
    const abortController = new AbortController();
    let stream: Query | undefined,
      settled = false;
    const pending = new Map<
      string,
      {
        approval: Approval;
        resolve: (value: PermissionResult) => void;
        input: Record<string, unknown>;
        cleanup: () => void;
      }
    >();
    let resolveDone!: () => void, rejectDone!: (error: Error) => void;
    const done = new Promise<void>((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });
    const timeout = setTimeout(
      () => finish(new Error('任务超过 45 分钟，已停止。请检查实际改动。')),
      45 * 60000,
    );
    function present() {
      const first = pending.values().next().value;
      if (first && !settled) hooks.approval(first.approval);
    }
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      for (const item of pending.values()) {
        item.cleanup();
        item.resolve({ behavior: 'deny', message: '任务已停止', interrupt: true });
      }
      pending.clear();
      abortController.abort();
      stream?.close();
      if (error) rejectDone(error);
      else resolveDone();
    }
    void (async () => {
      try {
        stream = start({
          prompt: buildPrompt(job),
          options: {
            cwd: project.cwd,
            pathToClaudeCodeExecutable: binary(),
            settingSources: ['user', 'project', 'local'],
            systemPrompt: { type: 'preset', preset: 'claude_code' },
            permissionMode: job.permissions?.confirmation === 'reduced' ? 'acceptEdits' : 'default',
            persistSession: false,
            stderr: () => {}, // Never forward raw provider diagnostics.
            abortController,
            sandbox: {
              enabled: true,
              failIfUnavailable: true,
              autoAllowBashIfSandboxed: job.permissions?.confirmation === 'reduced',
              allowUnsandboxedCommands: false,
            },
            // Preserve CLI deny rules and prevent configured allow rules bypassing path scope.
            hooks: {
              PreToolUse: [
                {
                  hooks: [
                    async (input) => {
                      if (input.hook_event_name !== 'PreToolUse') return {};
                      const data = record(input.tool_input);
                      const paths = ['file_path', 'path', 'cwd', 'notebook_path']
                        .map((key) => str(data[key]))
                        .filter(Boolean);
                      if (paths.some((path) => !insideProject(project.cwd, path)))
                        return {
                          hookSpecificOutput: {
                            hookEventName: 'PreToolUse',
                            permissionDecision: 'deny',
                            permissionDecisionReason: 'PointDOM 只允许访问当前绑定项目',
                          },
                        };
                      return {};
                    },
                  ],
                },
              ],
            },
            canUseTool: (tool, input, options) => {
              if (
                settled ||
                options.signal.aborted ||
                (options.blockedPath && !insideProject(project.cwd, options.blockedPath))
              )
                return Promise.resolve({
                  behavior: 'deny',
                  message: '未授予项目外访问或已停止的请求',
                });
              const id = randomUUID();
              const questions =
                tool === 'AskUserQuestion' && Array.isArray(input.questions)
                  ? input.questions.map(record).map((q, index) => ({
                      id: String(index),
                      question: str(q.question),
                      options: Array.isArray(q.options)
                        ? q.options.map((o) => str(record(o).label))
                        : [],
                    }))
                  : undefined;
              return new Promise<PermissionResult>((resolve) => {
                const onAbort = () => {
                  if (!pending.delete(id)) return;
                  resolve({ behavior: 'deny', message: '确认请求已取消', interrupt: true });
                  hooks.approved();
                  present();
                };
                const cleanup = () => options.signal.removeEventListener('abort', onAbort);
                pending.set(id, {
                  resolve,
                  input,
                  cleanup,
                  approval: {
                    id,
                    kind: questions
                      ? 'questions'
                      : /Edit|Write|NotebookEdit/.test(tool)
                        ? 'files'
                        : 'command',
                    title: `Claude Code 请求${questions ? '补充信息' : '确认'}`,
                    details: [
                      tool,
                      ...['command', 'file_path', 'path', 'description'].map((key) =>
                        str(input[key]),
                      ),
                    ]
                      .filter(Boolean)
                      .join('\n')
                      .slice(0, 12000),
                    ...(questions ? { questions } : {}),
                  },
                });
                options.signal.addEventListener('abort', onAbort, { once: true });
                if (pending.size === 1) present();
              });
            },
          },
        });
        hooks.event('Claude Code 已启动，正在处理当前项目');
        let result = false;
        for await (const message of stream) {
          if (settled) return;
          if (message.type === 'system' && message.subtype === 'init')
            hooks.thread(message.session_id);
          if (message.type === 'tool_progress') hooks.event(`Claude Code：${message.tool_name}`);
          if (message.type !== 'result') continue;
          result = true;
          if (message.subtype !== 'success' || message.is_error)
            throw new Error('Claude Code 执行失败，请检查登录、模型、额度或权限配置，以及实际改动');
          if (!message.result.trim()) throw new Error('Claude Code 未返回执行结果，请检查实际改动');
          hooks.result(message.result);
          finish();
          break;
        }
        if (!result && !settled) throw new Error('Claude Code 连接结束，未收到完成结果');
      } catch (error) {
        finish(
          new Error(
            error instanceof Error && /^(未找到 Claude Code|Claude Code)/.test(error.message)
              ? error.message
              : 'Claude Code 连接失败，请检查 CLI 登录、沙箱依赖和模型配置',
          ),
        );
      }
    })();
    return {
      done,
      cancel: () => finish(new Error('任务已停止；已写入的修改不会回滚')),
      reply: (id, reply) => {
        const item = pending.get(id);
        if (!item || settled) return;
        pending.delete(id);
        item.cleanup();
        const answers = item.approval.questions
          ? Object.fromEntries(
              item.approval.questions.map((q) => [q.question, reply.answers?.[q.id] || '']),
            )
          : undefined;
        item.resolve(
          reply.decision === 'accept' || (reply.decision !== 'decline' && reply.answers && answers)
            ? { behavior: 'allow', updatedInput: answers ? { ...item.input, answers } : item.input }
            : { behavior: 'deny', message: '用户拒绝本次操作' },
        );
        hooks.approved();
        present();
      },
    };
  };
}
export const runClaude = claudeRunner();
