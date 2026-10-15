import { version } from './version.js';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { buildPrompt, record, str, type Runner } from './codex.js';
import type { Approval } from '../shared/contracts.js';

// Resolve existing ancestors too: new files may not exist, and a parent may be a symlink.
export function insideProject(cwd: string, path: string) {
  let candidate = resolve(cwd, path);
  const suffix: string[] = [];
  while (true) {
    try {
      candidate = resolve(realpathSync(candidate), ...suffix);
      const distance = relative(cwd, candidate);
      return distance !== '..' && !distance.startsWith('../') && !isAbsolute(distance);
    } catch {
      const parent = dirname(candidate);
      if (parent === candidate) return false;
      suffix.unshift(relative(parent, candidate));
      candidate = parent;
    }
  }
}

export function acpRunner(binary: string, args: string[], name: string): Runner {
  return (project, job, _prior, hooks) => {
    const child = spawn(binary, args, {
      cwd: project.cwd,
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stderr.resume(); // Provider diagnostics can contain credentials.
    let sessionId = '',
      next = 0,
      settled = false,
      output = '';
    const requests = new Map<
      number,
      {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    >();
    const permissions = new Map<
      string,
      {
        rpcId: unknown;
        allow: string;
        reject: string;
        approval: Approval;
      }
    >();
    let resolveDone!: () => void, rejectDone!: (error: Error) => void;
    const done = new Promise<void>((resolve, reject) => {
      resolveDone = resolve;
      rejectDone = reject;
    });
    function send(message: unknown) {
      if (!child.stdin.destroyed) child.stdin.write(`${JSON.stringify(message)}\n`);
    }
    function kill(signal: NodeJS.Signals) {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {
        /* Process already stopped. */
      }
    }
    function respond(id: unknown, result: unknown) {
      send({ jsonrpc: '2.0', id, result });
    }
    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      for (const item of permissions.values())
        respond(item.rpcId, { outcome: { outcome: 'cancelled' } });
      permissions.clear();
      if (error && sessionId)
        send({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId } });
      for (const item of requests.values()) {
        clearTimeout(item.timer);
        item.reject(error || new Error(`${name} 连接已关闭`));
      }
      requests.clear();
      child.stdin.end();
      // Give the agent time to acknowledge cancellation and stop owned tools.
      setTimeout(() => kill('SIGTERM'), 250).unref();
      setTimeout(() => kill('SIGKILL'), 2250).unref();
      if (error) rejectDone(error);
      else resolveDone();
    }
    const timeout = setTimeout(
      () => finish(new Error('任务超过 45 分钟，已停止。请检查实际改动。')),
      45 * 60000,
    );
    function request(method: string, params: unknown, long = false): Promise<unknown> {
      const id = ++next;
      return new Promise((resolve, reject) => {
        if (settled) return reject(new Error(`${name} 连接已关闭`));
        const timer = setTimeout(
          () => {
            requests.delete(id);
            reject(new Error(`${name} ${method === 'session/prompt' ? '执行' : '连接'}超时`));
          },
          long ? 45 * 60000 : 30000,
        );
        requests.set(id, { resolve, reject, timer });
        send({ jsonrpc: '2.0', id, method, params });
      });
    }
    function present() {
      const first = permissions.values().next().value;
      if (first && !settled) hooks.approval(first.approval);
    }
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      if (settled) return;
      try {
        if (line.length > 2 * 1024 * 1024) throw new Error();
        const message = record(JSON.parse(line));
        if (message.jsonrpc !== '2.0') throw new Error();
        if (typeof message.id === 'number' && !message.method) {
          const pending = requests.get(message.id);
          if (!pending) return;
          requests.delete(message.id);
          clearTimeout(pending.timer);
          if (message.error) {
            const code = record(message.error).code;
            pending.reject(
              new Error(
                code === -32000
                  ? `${name} 需要登录，请先在终端登录对应 CLI`
                  : `${name} 请求失败，请检查登录、模型配置和 CLI 版本`,
              ),
            );
          } else pending.resolve(message.result);
          return;
        }
        const params = record(message.params);
        if (message.id !== undefined) {
          if (message.method !== 'session/request_permission' || params.sessionId !== sessionId) {
            send({
              jsonrpc: '2.0',
              id: message.id,
              error: { code: -32601, message: 'Unsupported request; no access granted' },
            });
            return;
          }
          const call = record(params.toolCall);
          const options = Array.isArray(params.options) ? params.options.map(record) : [];
          const allow = str(options.find((o) => o.kind === 'allow_once')?.optionId);
          const reject = str(options.find((o) => o.kind === 'reject_once')?.optionId);
          const input = record(call.rawInput);
          const locations = Array.isArray(call.locations) ? call.locations.map(record) : [];
          const paths = [
            ...locations.map((p) => str(p.path)),
            ...['file_path', 'path', 'cwd'].map((k) => str(input[k])),
          ].filter(Boolean);
          if (
            !allow ||
            !reject ||
            input.permission === 'external_directory' ||
            paths.some((path) => !insideProject(project.cwd, path))
          ) {
            respond(
              message.id,
              reject
                ? { outcome: { outcome: 'selected', optionId: reject } }
                : { outcome: { outcome: 'cancelled' } },
            );
            hooks.event(`${name} 未授予项目外或不支持的权限请求`);
            return;
          }
          const id = randomUUID();
          // This project explicitly permits routine edits. Commands, missing path
          // metadata and all out-of-project requests still require a user decision.
          if (
            job.permissions?.confirmation === 'reduced' &&
            call.kind === 'edit' &&
            paths.length > 0 &&
            !input.command &&
            !input.commands &&
            !['bash', 'shell'].includes(str(input.permission))
          ) {
            respond(message.id, { outcome: { outcome: 'selected', optionId: allow } });
            return;
          }
          permissions.set(id, {
            rpcId: message.id,
            allow,
            reject,
            approval: {
              id,
              kind: ['edit', 'delete', 'move'].includes(str(call.kind)) ? 'files' : 'command',
              title: `${name} 请求确认`,
              details: [str(call.title), str(input.command), ...paths]
                .filter(Boolean)
                .join('\n')
                .slice(0, 12000),
            },
          });
          if (permissions.size === 1) present();
          return;
        }
        if (message.method !== 'session/update' || params.sessionId !== sessionId) return;
        const update = record(params.update);
        if (update.sessionUpdate === 'agent_message_chunk') {
          const content = record(update.content);
          if (content.type === 'text') output = (output + str(content.text)).slice(-64000);
        }
        if (update.sessionUpdate === 'tool_call')
          hooks.event(`${name}：${str(update.title).slice(0, 500) || '正在处理'}`);
      } catch {
        finish(new Error(`${name} 协议响应无效，请检查 CLI 版本`));
      }
    });
    child.stdin.on('error', () => finish(new Error(`${name} 连接中断`)));
    child.on('error', () =>
      finish(new Error(`无法启动 ${name}，请安装并登录对应 CLI，或设置本机可执行文件路径`)),
    );
    child.on('exit', (code) => finish(new Error(`${name} CLI 已退出 (${code ?? 'signal'})`)));
    void (async () => {
      try {
        const init = record(
          await request('initialize', {
            protocolVersion: 1,
            clientInfo: { name: 'pointdom', title: 'PointDOM', version },
            clientCapabilities: {},
          }),
        );
        if (init.protocolVersion !== 1) throw new Error(`${name} ACP 协议版本不兼容`);
        const session = record(await request('session/new', { cwd: project.cwd, mcpServers: [] }));
        sessionId = str(session.sessionId);
        if (!sessionId) throw new Error(`${name} 未返回有效会话`);
        hooks.thread(sessionId);
        hooks.event(`${name} 已连接，正在处理当前项目`);
        const result = record(
          await request(
            'session/prompt',
            { sessionId, prompt: [{ type: 'text', text: buildPrompt(job) }] },
            true,
          ),
        );
        if (settled) return;
        if (result.stopReason !== 'end_turn')
          throw new Error(
            `${name} 未完成任务（${str(result.stopReason) || '未知状态'}），请检查实际改动`,
          );
        if (!output.trim()) throw new Error(`${name} 未返回执行结果，请检查实际改动`);
        hooks.result(output);
        finish();
      } catch (error) {
        finish(error instanceof Error ? error : new Error(`${name} 执行失败`));
      }
    })();
    return {
      done,
      cancel: () => finish(new Error('任务已停止；已写入的修改不会回滚')),
      reply: (id, reply) => {
        const item = permissions.get(id);
        if (!item || settled) return;
        respond(item.rpcId, {
          outcome: {
            outcome: 'selected',
            optionId: reply.decision === 'accept' ? item.allow : item.reject,
          },
        });
        permissions.delete(id);
        hooks.approved();
        present();
      },
    };
  };
}

export const runTrae: Runner = (...args) =>
  acpRunner(
    process.env.PAGEPATCH_TRAE_BIN || 'traecli',
    [
      '--permission-mode',
      args[1].permissions?.confirmation === 'reduced' ? 'auto' : 'default',
      'acp',
      'serve',
    ],
    'Trae',
  )(...args);
