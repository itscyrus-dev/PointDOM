/** Localized setup handoff. Never interpolate browser/page data or pairing credentials. */
const instructions = {
  'zh-CN': `请完成当前项目的 PointDOM 接入，遵循项目规则和安装指南：https://github.com/itscyrus-dev/PointDOM/blob/main/docs/INSTALL_AGENT.md

浏览器已配对。复用本机 pdo，确认真实项目目录和开发网址，执行 pdo link --path <项目目录> --origin <开发网址> 和 pdo connect --path <项目目录> --json，将生成配置合并到当前客户端，保留已有配置。

Trae 项目配置用 .trae/mcp.json，开启“项目级 MCP”和 PointDOM 服务；独立 Agent 窗口未加载时，在该窗口的设置 → MCP → 本地导入同一项目配置，不切到 IDE。宿主禁止写入时给出完整 JSON 和最少手动步骤，不绕过限制。

先确认没有执行中的批注，再重启或重连该 MCP 服务（已有配置也需要），加载最新程序。在当前对话原生调用 pointdom_list_tasks，返回正确项目及 connection.id 才能报告接通；tasks: [] 单独不算，不用临时 SDK 进程代替验证。不能自行重连时说明当前窗口的具体步骤。用中文报告结果及剩余操作。不要重复配对或重装，不修改业务代码、模型或全局权限，不领取任务、付费测试、提交或推送。`,
  en: `Finish connecting PointDOM to this project. Follow project rules and https://github.com/itscyrus-dev/PointDOM/blob/main/docs/INSTALL_AGENT.md

The browser is paired. Reuse local pdo, confirm the real project directory and development URL, run pdo link --path <project-directory> --origin <development-url> and pdo connect --path <project-directory> --json, then merge the generated configuration into this client, preserving existing settings.

Trae project config uses .trae/mcp.json; enable project MCP and PointDOM. If the separate Agent window has not loaded it, import the same project-bound entry in that window's Settings → MCP → Local; do not switch to the IDE. If writes are forbidden, provide the complete JSON and minimal manual steps without bypassing restrictions.

Finish any claimed work first. Restart or reconnect the MCP server even when configured, to load updated code. Call pointdom_list_tasks natively in this conversation, read-only; require the correct project and connection.id before reporting connected. tasks: [] alone is not proof; do not substitute a temporary SDK process. If host reconnection requires me, give exact steps in this window. Report results and remaining steps in English. Do not pair again, reinstall, change application code, models or global permissions, claim tasks, run paid tests, commit or push.`,
};

export function agentSetupInstruction(language: 'zh-CN' | 'en'): string {
  return instructions[language];
}
