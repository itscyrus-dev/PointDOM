import type { AgentConnection } from './contracts.js';
export type ClientId = 'codex' | 'trae' | 'claude' | 'zcode' | 'opencode' | 'other';
type Preset = { id: ClientId; name: string; guide: string; aliases: readonly string[] };
export type ClientEntry = { preset: Preset; label: string; connection?: AgentConnection };
const presets: readonly Preset[] = [
  {
    id: 'codex',
    name: 'Codex',
    guide: 'CODEX',
    aliases: ['codex', 'codexmcpclient', 'codexdesktop'],
  },
  { id: 'trae', name: 'Trae', guide: 'TRAE', aliases: ['trae', 'traecn', 'traecodingagent'] },
  { id: 'claude', name: 'Claude Code', guide: 'CLAUDE_CODE', aliases: ['claude', 'claudecode'] },
  { id: 'zcode', name: 'Zcode', guide: 'GENERIC_MCP', aliases: ['zcode', 'zcodemcpclient'] },
  { id: 'opencode', name: 'OpenCode', guide: 'OPENCODE', aliases: ['opencode', 'opencodeclient'] },
  { id: 'other', name: '其他 MCP 客户端', guide: 'GENERIC_MCP', aliases: [] },
];
const presetId = (name: string) =>
  presets.find((preset) => preset.aliases.includes(name.toLowerCase().replace(/[\s._-]+/g, '')))
    ?.id || 'other';

/** Catalog entries are setup affordances, never evidence that a client is installed or connected. */
export function clientEntries(connections: readonly AgentConnection[]): ClientEntry[] {
  return presets.flatMap((preset) => {
    const matches = connections.filter((connection) => presetId(connection.name) === preset.id);
    const live = matches.map((connection) => ({
      preset,
      connection,
      label: `${preset.id === 'other' ? connection.name : preset.name}${matches.filter((other) => preset.id !== 'other' || other.name === connection.name).length > 1 ? ` · ${connection.id.slice(0, 6)}` : ''}`,
    }));
    return !matches.length || preset.id === 'other'
      ? [...live, { preset, label: preset.name }]
      : live;
  });
}

/** Use only trusted catalog names/guides. The host resolves its own workspace, URL and configuration. */
export function clientSetupInstruction(language: 'zh-CN' | 'en', id: ClientId): string {
  const preset = presets.find((preset) => preset.id === id)!;
  const guide = `https://github.com/itscyrus-dev/PointDOM/blob/main/docs/agents/${preset.guide}.md`;
  return language === 'zh-CN'
    ? `请在当前项目中接入 ${id === 'other' ? '本客户端的' : preset.name} PointDOM MCP，遵循项目规则及指南：${guide}\n\n复用本机 pdo，确认当前源码目录和实际开发网址；按需执行 pdo link --path <项目目录> --origin <开发网址>，用 pdo connect --path <项目目录> --json 导出并合并 MCP 配置，保留已有设置。先确认没有执行中的批注，再重启或重连该 MCP 服务（已有配置也需要），旧进程不会随文件更新。在当前对话原生调用 pointdom_list_tasks，返回正确项目及 connection.id 才算接通；tasks: [] 单独不算，不能用临时 SDK 进程代替验证。不能自行重连时，只给出当前窗口的具体重连步骤。\n\n用中文报告结果。不领取任务、不修改业务代码或全局权限、不重复配对或重装，不提交或推送。`
    : `Connect PointDOM MCP in this project's ${id === 'other' ? 'coding client' : preset.name}. Follow project rules and ${guide}\n\nReuse local pdo. Resolve the real source directory and development URL; use pdo link --path <project-directory> --origin <development-url> as needed, then pdo connect --path <project-directory> --json. Merge its MCP configuration, preserving existing settings. Finish any claimed work first. Even with existing config, restart or reconnect the MCP server to load updated code. Use this conversation’s native pointdom_list_tasks read-only; require the correct project and connection.id before reporting connected. tasks: [] alone is not proof. Do not substitute a temporary SDK process. If host reconnection requires me, give exact steps in this window.\n\nReport results in English. Do not claim tasks, edit application code or global permissions, pair again, reinstall, commit or push.`;
}
