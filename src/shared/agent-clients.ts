import type { AgentConnection } from './contracts.js';
export type ClientId = 'codex' | 'trae' | 'claude' | 'zcode' | 'opencode' | 'other';
type Preset = { id: ClientId; name: string; guide: string; aliases: readonly string[] };
export type ClientEntry = {
  preset: Preset;
  label: string;
  connection?: AgentConnection;
  sessions?: AgentConnection[];
};
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
    const groups = new Map<string, AgentConnection[]>();
    for (const connection of matches) {
      const label = preset.id === 'other' ? connection.name : preset.name;
      const sessions = groups.get(label) || [];
      sessions.push(connection);
      groups.set(label, sessions);
    }
    const live = [...groups].map(([label, sessions]) => ({
      preset,
      label,
      ...(sessions.length === 1 ? { connection: sessions[0] } : { sessions }),
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
  const command = id === 'opencode' ? 'pdo connect --client opencode --json' : 'pdo connect --json';
  return language === 'zh-CN'
    ? `请接入当前项目的 PointDOM，遵循项目规则和 ${guide}\n复用本机 pdo，按实际源码目录和网址执行 pdo link --path <项目目录> --origin <开发网址>。用 ${command} 导出通用 pointdom 配置，在本客户端全局 MCP 中合并一次，保留其他设置。先确认没有执行中的批注，再重启或重连；旧项目专用条目确认不用后再移除，避免重复连接。\n在当前对话原生调用 pointdom_bind_project(path=真实源码目录)，之后所有任务调用带返回的 projectId；调用 pointdom_list_tasks 验证项目和 connection.id，tasks: [] 单独不算，不用临时 SDK 进程验证。不能自动接通时给出本窗口具体操作。用中文报告；不领取任务、不改业务代码或全局权限、不重装、提交或推送。`
    : `Connect PointDOM for this project, following project rules and ${guide}\nReuse local pdo; register the real workspace and URL with pdo link --path <source-directory> --origin <development-url>. Export ${command}; merge the universal pointdom entry once into this client's global MCP settings, preserving other settings. Finish claimed work before you restart or reconnect. Remove obsolete project-specific entries only after confirming they are unused.\nUse native pointdom_bind_project with the actual workspace path, then pass its projectId on every task call. Call pointdom_list_tasks and verify project and connection.id; tasks: [] alone is not proof. Never substitute an SDK process. If blocked, give exact host steps. Report in English. Do not claim tasks, change application code or global permissions, reinstall, commit or push.`;
}

/** Explicit user opt-in to an agent turn; copying is not evidence of an active wait. */
export function monitoringInstruction(language: 'zh-CN' | 'en'): string {
  return language === 'zh-CN'
    ? '先用 pointdom_bind_project 绑定真实源码目录，后续每次调用都带返回的 projectId。持续处理当前项目分配给你的 PointDOM 批注：调用 pointdom_wait_for_task 等待任务；收到 taskId 后读取并领取，按项目规则修改和验证，用 pointdom_progress_task 回报进度、pointdom_report_task 回报结果，然后继续等待。等待超时则再次等待；我要求停止、工具报错或连接断开时停止并说明原因。不要自行提交、推送或修改全局权限。'
    : 'Bind the actual workspace with pointdom_bind_project and pass its projectId on every call. Watch assigned annotations using pointdom_wait_for_task. When taskId arrives, get and claim it, edit and verify following project rules, send progress with pointdom_progress_task and results with pointdom_report_task, then wait again. Continue after wait timeouts. Stop and explain on user stop, tool errors or disconnect. Do not commit, push or change global permissions.';
}
