import { cliDiagnostic, cliErrorCode } from './cli-diagnostic.js';
import { cliActivity, redactCliText } from './cli-activity.js';
import { spawn, execFile } from 'node:child_process';
import { access, realpath } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join } from 'node:path';
import { homedir } from 'node:os';
import { z } from 'zod';
import { cliIds, type CliId, type CliStatus } from '../shared/cli.js';
import { agentContext } from '../shared/agent-context.js';
import type { Job, Project } from '../shared/contracts.js';
export type CliBinary = {
  command: string;
  prefix: string[];
  dialect: 'exec' | 'print';
  standalone?: boolean;
  completionOnExit?: boolean;
};
type Resolve = (id: CliId) => Promise<CliBinary | null>;
const names = { codex: 'codex', claude: 'claude', opencode: 'opencode', trae: 'traecli' };
const help = (command: string, args: string[]) =>
  new Promise<string>((resolve) => {
    execFile(
      command,
      args,
      { timeout: 5000, maxBuffer: 128 * 1024, windowsHide: true },
      (error, stdout) => resolve(error ? '' : stdout),
    );
  });
/** Resolve only trusted local installation paths, never a command or PATH supplied by a browser submission. */
async function discover(id: CliId): Promise<CliBinary | null> {
  const directories = [
    ...(process.env.PATH || '').split(delimiter),
    join(homedir(), '.local/bin'),
    join(homedir(), '.opencode/bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
  const explicit = process.env[`POINTDOM_${id.toUpperCase()}_BIN`];
  const candidates =
    explicit && isAbsolute(explicit)
      ? [explicit]
      : directories
          .filter(isAbsolute)
          .map((dir) => join(dir, names[id] + (process.platform === 'win32' ? '.exe' : '')));
  // npm's Windows command shims cannot be spawned without a shell. Use known JS entry points instead.
  if (process.platform === 'win32') {
    const packages = {
      codex: '@openai/codex/bin/codex.js',
      claude: '@anthropic-ai/claude-code/cli.js',
      opencode: 'opencode-ai/bin/opencode',
      trae: '',
    };
    for (const dir of directories.filter(isAbsolute))
      if (packages[id]) {
        const entry = join(dir, 'node_modules', packages[id]);
        if (existsSync(entry)) candidates.push(entry);
      }
  }
  for (const path of [...new Set(candidates)]) {
    try {
      await access(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
      const resolved = await realpath(path);
      const js =
        /\.(?:c?js|mjs)$/.test(resolved) || resolved.includes('node_modules/opencode-ai/bin/');
      const command = js ? process.execPath : resolved;
      const prefix = js ? [resolved] : [];
      const output = await help(command, [
        ...prefix,
        ...(id === 'codex' ? ['exec'] : id === 'opencode' ? ['run'] : []),
        '--help',
      ]);
      if (id === 'trae' && /\bexec\b/.test(output)) {
        const execHelp = await help(command, [...prefix, 'exec', '--help']);
        if (execHelp.includes('--json')) return { command, prefix, dialect: 'exec' };
      }
      if (
        id === 'trae'
          ? output.includes('--print') && output.includes('--output-format')
          : id === 'claude'
            ? output.includes('--output-format')
            : id === 'codex'
              ? output.includes('--json')
              : output.includes('--format')
      ) {
        const version = id === 'opencode' ? await help(command, [...prefix, '--version']) : '';
        const major = Number(/(?:opencode\s+v?|^v?)(\d+)\./i.exec(version.trim())?.[1]);
        return {
          command,
          prefix,
          dialect: id === 'trae' ? 'print' : 'exec',
          standalone: id === 'opencode' && output.includes('--standalone'),
          completionOnExit: id === 'opencode' && major >= 2,
        };
      }
    } catch {
      /* Missing or inaccessible executable; try the next trusted installation. */
    }
  }
  return null;
}
export function cliArguments(id: CliId, dialect: CliBinary['dialect']): string[] {
  switch (id) {
    case 'codex':
      return ['exec', '--json', '--color', 'never', '--sandbox', 'workspace-write', '-'];
    case 'claude':
      return ['--print', '--verbose', '--output-format', 'stream-json'];
    case 'opencode':
      return ['run', '--format', 'json'];
    case 'trae':
      return dialect === 'print'
        ? ['--print', '--output-format', 'stream-json']
        : ['exec', '--json', '--color', 'never', '--sandbox', 'workspace-write', '-'];
  }
}
const object = z.record(z.string(), z.unknown());
const record = (value: unknown) => object.safeParse(value).data || {};
export type CliEvent = { text?: string; done?: boolean; error?: string; activity?: string };
export function parseCliEvent(id: CliId, value: unknown): CliEvent {
  const event = record(value),
    item = record(event.item),
    part = record(event.part);
  if (event.type === 'error' || event.type === 'turn.failed' || event.type === 'session.error')
    return { error: 'CLI_REPORTED_ERROR' };
  if (id === 'codex' || (id === 'trae' && String(event.type).startsWith('turn.'))) {
    if (event.type === 'turn.completed') return { done: true };
  }
  if (
    event.type === 'item.completed' &&
    item.type === 'agent_message' &&
    typeof item.text === 'string'
  )
    return { text: item.text };

  if ((id === 'claude' || id === 'trae') && event.type === 'result') {
    if (Array.isArray(event.permission_denials) && event.permission_denials.length)
      return { error: 'CLI_PERMISSION_DENIED' };
    if (event.is_error || event.subtype !== 'success') return { error: 'CLI_REPORTED_ERROR' };
    return { done: true, ...(typeof event.result === 'string' ? { text: event.result } : {}) };
  }
  if (id === 'opencode') {
    if (event.type === 'text' && typeof part.text === 'string') return { text: part.text };
    if (event.type === 'step_finish' && part.reason === 'stop') return { done: true };
  }
  return {};
}
/** Never persist raw tool output, stderr, thinking, credentials or environment snapshots. */
export function safeReport(text: string) {
  return redactCliText(text).slice(0, 24000);
}
export class CliRunner {
  private cache: { expires: number; values: Map<CliId, CliBinary | null> } | undefined;
  private checking: Promise<Map<CliId, CliBinary | null>> | undefined;
  private resolve: Resolve;
  constructor(private options: { resolve?: Resolve; timeoutMs?: number } = {}) {
    this.resolve = options.resolve || discover;
  }
  private async binaries(force = false) {
    if (!force && this.cache && this.cache.expires > Date.now()) return this.cache.values;
    if (this.checking) return this.checking;
    this.checking = Promise.all(cliIds.map(async (id) => [id, await this.resolve(id)] as const))
      .then((entries) => {
        const values = new Map(entries);
        this.cache = { values, expires: Date.now() + 15000 };
        return values;
      })
      .finally(() => {
        this.checking = undefined;
      });
    return this.checking;
  }
  async list(force = false): Promise<CliStatus[]> {
    const values = await this.binaries(force);
    return cliIds.map((id) => ({
      id,
      available: !!values.get(id),
      reason: values.get(id) ? 'detected' : 'missing',
    }));
  }
  async run(
    id: CliId,
    job: Job,
    project: Project,
    signal: AbortSignal,
    progress: (message: string) => void,
  ): Promise<string> {
    const binary = await this.resolve(id);
    if (signal.aborted) throw new Error('CLI_CANCELLED');
    if (!binary) throw new Error('CLI_NOT_FOUND');
    const cwd = await realpath(project.cwd);
    if (cwd !== project.cwd) throw new Error('CLI_PROJECT_MOVED');
    const prompt = JSON.stringify(agentContext(job));
    return new Promise((resolve, reject) => {
      const child = spawn(
        binary.command,
        [
          ...binary.prefix,
          ...cliArguments(id, binary.dialect),
          ...(binary.standalone ? ['--standalone'] : []),
        ],
        {
          cwd,
          shell: false,
          detached: process.platform !== 'win32',
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            PATH: `${dirname(binary.command)}${delimiter}${process.env.PATH || ''}`,
            NO_COLOR: '1',
          },
        },
      );
      let buffer = '',
        result = '',
        done = false,
        failure = '',
        bytes = 0,
        stderr = '';
      const stderrDecoder = new TextDecoder();
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const kill = (force = false) => {
        if (!child.pid) return;
        try {
          if (process.platform === 'win32')
            execFile(
              'taskkill.exe',
              ['/PID', String(child.pid), '/T', '/F'],
              { windowsHide: true },
              () => {},
            );
          else process.kill(-child.pid, force ? 'SIGKILL' : 'SIGTERM');
        } catch {
          /* Already exited. */
        }
      };
      const terminate = () => {
        kill();
        killTimer ??= setTimeout(() => kill(true), 1000);
        killTimer.unref();
      };
      const abort = () => {
        failure = 'CLI_CANCELLED';
        terminate();
      };
      const timer = setTimeout(
        () => {
          failure = 'CLI_TIMEOUT';
          terminate();
        },
        this.options.timeoutMs ?? 30 * 60 * 1000,
      );
      timer.unref();
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
      const activity = cliActivity(id);
      const line = (text: string) => {
        if (!text.trim()) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          return;
        }
        const event = parseCliEvent(id, parsed);
        if (event.error) {
          const parsedEvent = record(parsed);
          const detail = record(parsedEvent.error).message || parsedEvent.message;
          failure =
            event.error === 'CLI_REPORTED_ERROR' && typeof detail === 'string'
              ? cliErrorCode(detail)
              : event.error;
        }
        if (event.text) result = safeReport(event.text);
        if (event.done) done = true;
        for (const message of activity(parsed)) progress(message);
      };
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > 16 * 1024 * 1024 || buffer.length + chunk.length > 1024 * 1024) {
          failure = 'CLI_OUTPUT_LIMIT';
          terminate();
          return;
        }
        buffer += chunk;
        let end: number;
        while ((end = buffer.indexOf('\n')) >= 0) {
          line(buffer.slice(0, end));
          buffer = buffer.slice(end + 1);
        }
      });
      // Retain a bounded private buffer; expose only redacted error-shaped diagnostics on failure.
      child.stderr.on('data', (chunk: Buffer) => {
        const text = stderrDecoder.decode(chunk, { stream: true });
        if (stderr.length < 16384) stderr = (stderr + text).slice(0, 16384);
        bytes += chunk.length;
        if (bytes > 16 * 1024 * 1024) {
          failure = 'CLI_OUTPUT_LIMIT';
          terminate();
        }
      });
      child.stdin.on('error', () => {});
      child.once('spawn', () => progress('CLI_STARTED'));
      child.once('error', () => {
        failure = 'CLI_START_FAILED';
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (killTimer && !failure) clearTimeout(killTimer);
        signal.removeEventListener('abort', abort);
        line(buffer);
        stderr += stderrDecoder.decode();
        const diagnostic = cliDiagnostic(stderr);
        if ((failure || code !== 0) && diagnostic) {
          progress(`tool · error\n${diagnostic}`);
          if (!failure || failure === 'CLI_REPORTED_ERROR') failure = cliErrorCode(diagnostic);
        }
        progress(`process_exit · ${code === null ? 'signal' : `exit=${code}`}`);
        if (failure) reject(new Error(failure));
        else if (code !== 0) reject(new Error('CLI_EXIT_FAILED'));
        else if ((!done && !(id === 'opencode' && binary.completionOnExit)) || !result.trim())
          reject(new Error('CLI_NO_RESULT'));
        else resolve(result);
      });
      child.stdin.end(prompt);
    });
  }
}
