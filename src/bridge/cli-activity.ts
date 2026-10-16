import { z } from 'zod';
import type { CliId } from '../shared/cli.js';
const schema = z.record(z.string(), z.unknown());
const record = (value: unknown) => schema.safeParse(value).data || {};
const string = (value: unknown) => (typeof value === 'string' ? value : '');
export function redactCliText(text: string) {
  for (const [name, value] of Object.entries(process.env)) {
    if (value && value.length >= 8 && /(?:TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL)/i.test(name))
      text = text.replaceAll(value, '[REDACTED]');
  }
  return text
    .replace(/\u001b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/gi, 'https://[REDACTED]@')
    .replace(/(?:Bearer\s+|(?:sk-|ghp_|github_pat_))[a-zA-Z0-9_.-]+/gi, '[REDACTED]')
    .replace(
      /(["']?(?:[\w-]*(?:api[_-]?key|token|password|secret|authorization|cookie))["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/gi,
      '$1[REDACTED]',
    )
    .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, '[REDACTED]');
}
const bounded = (text: string, limit = 3800) => {
  const safe = redactCliText(text);
  return safe.length > limit ? safe.slice(0, limit) + '\n[truncated]' : safe;
};
/** Summarize only reported tool data. Do not serialize arbitrary input (source, prompts, thoughts). */
function target(input: unknown) {
  const value = record(input);
  return (
    string(value.command) ||
    string(value.file_path) ||
    string(value.filePath) ||
    string(value.path) ||
    string(value.pattern) ||
    string(value.url)
  );
}
function output(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value))
    return value
      .flatMap((block) => {
        const b = record(block);
        return b.type === 'text' && typeof b.text === 'string' ? [b.text] : [];
      })
      .join('\n');
  return '';
}
/** Stateful per process: correlate result IDs and deduplicate retransmitted protocol events. */
export function cliActivity(id: CliId) {
  const calls = new Map<string, string>();
  const seen = new Map<string, string>();
  return (value: unknown): string[] => {
    const e = record(value),
      item = record(e.item),
      part = record(e.part);
    const entries: { key: string; text: string }[] = [];
    if (['error', 'turn.failed', 'session.error'].includes(string(e.type))) {
      const detail = string(e.message) || string(record(e.error).message);
      if (detail)
        entries.push({ key: `error:${detail.slice(0, 100)}`, text: `tool · error\n${detail}` });
    }
    if (id === 'codex' || id === 'trae') {
      if (['item.started', 'item.updated', 'item.completed'].includes(string(e.type))) {
        const phase = e.type === 'item.completed' ? string(item.status) || 'completed' : 'running';
        if (item.type === 'command_execution' && typeof item.command === 'string')
          entries.push({
            key: `${item.id}:${phase}`,
            text: `command · ${phase}${typeof item.exit_code === 'number' ? ` · exit=${item.exit_code}` : ''}\n${item.command}${e.type === 'item.completed' && typeof item.aggregated_output === 'string' ? `\n${bounded(item.aggregated_output, 2600)}` : ''}`,
          });
        if (item.type === 'file_change' && Array.isArray(item.changes)) {
          const files = item.changes
            .map((change) => {
              const c = record(change);
              return `${string(c.kind)} ${string(c.path)}`.trim();
            })
            .filter(Boolean)
            .join('\n');
          if (files)
            entries.push({ key: `${item.id}:files:${phase}`, text: `files · ${phase}\n${files}` });
        }
        if (item.type === 'mcp_tool_call')
          entries.push({
            key: `${item.id}:mcp:${phase}`,
            text: `tool · ${phase} · ${string(item.server)}/${string(item.tool)}`,
          });
        if (item.type === 'web_search' && typeof item.query === 'string')
          entries.push({
            key: `${item.id}:search:${phase}`,
            text: `web_search · ${phase}\n${item.query}`,
          });
      }
    }
    if (id === 'claude' || id === 'trae') {
      const content = record(e.message).content;
      if (Array.isArray(content))
        for (const block of content) {
          const b = record(block);
          if (e.type === 'assistant' && b.type === 'tool_use' && typeof b.name === 'string') {
            const name = `${b.name}${target(b.input) ? ` · ${target(b.input)}` : ''}`;
            if (typeof b.id === 'string' && calls.size < 500) calls.set(b.id, name);
            entries.push({ key: `${b.id}:start`, text: `tool · running · ${name}` });
          }
          if (e.type === 'user' && b.type === 'tool_result') {
            const name = calls.get(string(b.tool_use_id));
            entries.push({
              key: `${b.tool_use_id}:result`,
              text: `tool · ${b.is_error ? 'error' : 'completed'} · ${name || string(b.tool_use_id)}${output(b.content) ? `\n${bounded(output(b.content), 2600)}` : ''}`,
            });
          }
        }
    }
    if (id === 'opencode' && e.type === 'tool_use') {
      const state = record(part.state),
        name = string(part.tool);
      if (name)
        entries.push({
          key: `${part.callID || part.id}:${state.status}`,
          text: `tool · ${string(state.status) || 'reported'} · ${name}${target(state.input) ? ` · ${target(state.input)}` : ''}${typeof state.output === 'string' ? `\n${bounded(state.output, 2600)}` : typeof state.error === 'string' ? `\n${bounded(state.error, 2600)}` : ''}`,
        });
    }
    return entries.flatMap((entry) => {
      const text = bounded(entry.text);
      if (seen.get(entry.key) === text) return [];
      if (seen.size >= 1000) return [];
      seen.set(entry.key, text);
      return [text];
    });
  };
}
