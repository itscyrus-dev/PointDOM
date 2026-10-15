import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import type { Delivery, Executor } from '../shared/contracts.js';

export type HandoffResult = Pick<Delivery, 'state' | 'detail'>;
// Fixed script; neither page data nor instructions are evaluated as AppleScript.
export const pasteScript = `on run argv
  set appID to item 1 of argv
  set marker to item 2 of argv
  tell application "System Events"
    if not UI elements enabled then return "accessibility"
    set matches to application processes whose bundle identifier is appID
    if (count of matches) is 0 then return "focus"
    set targetProcess to item 1 of matches
    set frontmost of targetProcess to true
    delay 0.2
    tell targetProcess
      if not frontmost then return "focus"
      try
        set inputElement to value of attribute "AXFocusedUIElement"
        set inputRole to value of attribute "AXRole" of inputElement
        if inputRole is not "AXTextArea" and inputRole is not "AXTextField" then return "focus"
        set hint to ""
        repeat with attributeName in {"AXDescription", "AXHelp", "AXPlaceholderValue", "AXIdentifier", "AXTitle"}
          try
            set hint to hint & " " & (value of attribute (contents of attributeName) of inputElement as text)
          end try
        end repeat
        ignoring case
          repeat with needle in {"search", "find", "filter", "editor", "monaco", "terminal", "commit", "搜索", "查找", "筛选", "编辑器", "终端", "提交信息"}
            if hint contains (contents of needle) then return "focus"
          end repeat
          set isChat to false
          repeat with needle in {"prompt", "chat", "message", "ask", "提问", "消息", "对话", "发送"}
            if hint contains (contents of needle) then set isChat to true
          end repeat
          if not isChat then return "focus"
        end ignoring
        set previousText to value of attribute "AXValue" of inputElement as text
        if previousText contains marker then return "pasted"
        if previousText is not "" and previousText is not linefeed then return "draft"
        if not ((the clipboard as text) contains marker) then return "verify"
        if not frontmost then return "focus"
        if (value of attribute "AXFocusedUIElement") is not inputElement then return "focus"
        keystroke "v" using command down
        repeat 10 times
          delay 0.1
          if (value of attribute "AXValue" of inputElement as text) contains marker then return "pasted"
        end repeat
      on error
        return "focus"
      end try
    end tell
  end tell
  return "verify"
end run`;

async function command(binary: string, args: string[], signal: AbortSignal, input?: string) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(binary, args, {
      shell: false,
      stdio: ['pipe', 'pipe', 'ignore'],
      signal,
      timeout: 10000,
    });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-4096);
    });
    child.on('error', () => reject(new Error('desktop_command_failed')));
    child.on('close', (code) =>
      code === 0 ? resolve(output.trim()) : reject(new Error('desktop_command_failed')),
    );
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

export async function pasteIntoClient(
  target: Executor,
  text: string,
  taskId: string,
  signal: AbortSignal,
): Promise<HandoffResult> {
  if (process.platform !== 'darwin')
    return { state: 'blocked', detail: '自动填入客户端目前仅支持 macOS。可使用复制处理指令。' };
  try {
    await command('/usr/bin/pbcopy', [], signal, text);
  } catch {
    return { state: 'blocked', detail: '无法写入剪贴板，请使用复制处理指令。' };
  }
  const names: Record<Executor, string> = {
    codex: 'Codex',
    opencode: 'OpenCode',
    claude: 'Claude',
    trae: 'Trae',
    mcp: '',
  };
  const configured = process.env[`PAGEPATCH_${target.toUpperCase()}_APP`];
  const app =
    configured && isAbsolute(configured) && configured.endsWith('.app')
      ? configured
      : [
          join('/Applications', `${names[target]}.app`),
          join(homedir(), 'Applications', `${names[target]}.app`),
        ].find((path) => names[target] && existsSync(path));
  if (!app || !existsSync(app))
    return {
      state: 'copied',
      detail: '处理指令已自动复制。未找到客户端应用，请打开已配置 MCP 的客户端后粘贴。',
    };
  try {
    const bundle = await command(
      '/usr/libexec/PlistBuddy',
      ['-c', 'Print :CFBundleIdentifier', join(app, 'Contents/Info.plist')],
      signal,
    );
    if (!/^[\w.-]+$/.test(bundle)) throw new Error('invalid_application');
    await command('/usr/bin/open', ['-a', app], signal);
    const result = await command('/usr/bin/osascript', ['-e', pasteScript, bundle, taskId], signal);
    if (result === 'pasted')
      return {
        state: 'pasted',
        detail: '处理指令已填入客户端输入框，请在客户端按发送。任务仍等待 Agent 领取。',
      };
    return {
      state: 'copied',
      detail:
        result === 'accessibility'
          ? '处理指令已复制。请在 macOS 辅助功能中允许 PointDOM 使用的 Node 程序控制客户端，然后重新填入。'
          : result === 'draft'
            ? '客户端输入框已有草稿，已保留。处理指令已复制；请打开空白对话输入框后重新填入。'
            : '处理指令已复制。请在客户端点击空白对话输入框，再点重新填入；也可直接粘贴。',
    };
  } catch {
    return {
      state: 'copied',
      detail: '处理指令已复制，但未确认填入客户端。请检查客户端输入框后重试。',
    };
  }
}
