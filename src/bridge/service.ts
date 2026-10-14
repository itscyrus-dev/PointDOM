import { mkdirSync, writeFileSync, existsSync, unlinkSync, accessSync, constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const label = 'dev.pointdom.bridge';
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const xml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
export function launchAgent(
  node: string,
  entry: string,
  state: string,
  binary: string,
  path: string,
) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${[node, entry, 'serve'].map((arg) => `<string>${xml(arg)}</string>`).join('')}</array>
<key>WorkingDirectory</key><string>${xml(dirname(entry))}</string>
<key>EnvironmentVariables</key><dict>
${Object.entries({ PAGEPATCH_HOME: state, PAGEPATCH_OPENCODE_BIN: binary, PATH: path })
  .map(([key, value]) => `<key>${key}</key><string>${xml(value)}</string>`)
  .join('\n')}
</dict>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>ThrottleInterval</key><integer>10</integer>
</dict></plist>\n`;
}
function file() {
  return join(homedir(), 'Library/LaunchAgents', `${label}.plist`);
}
export function findOpenCode() {
  const explicit = process.env.PAGEPATCH_OPENCODE_BIN;
  const candidates = explicit
    ? [resolve(explicit)]
    : (process.env.PATH || '').split(':').map((path) => join(path, 'opencode'));
  const binary = candidates.find((path) => {
    try {
      accessSync(path, constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
  if (!binary) throw new Error('请先安装 OpenCode CLI，或设置 PAGEPATCH_OPENCODE_BIN 的绝对路径');
  execFileSync(binary, ['--version'], { stdio: 'pipe', timeout: 10000 });
  return binary;
}
export function installService(state: string) {
  if (process.platform !== 'darwin')
    throw new Error('自动启动目前支持 macOS；其他平台请使用 pnpm start');
  const binary = findOpenCode();
  const entry = fileURLToPath(new URL('./main.js', import.meta.url));
  const path = `${dirname(process.execPath)}:${dirname(binary)}:${process.env.PATH || '/usr/bin:/bin'}`;
  const plist = file();
  if (existsSync(plist))
    throw new Error('后台服务已安装；更新前请先执行 pdo uninstall（会停止当前任务）');
  mkdirSync(dirname(plist), { recursive: true });
  mkdirSync(state, { recursive: true, mode: 0o700 });
  writeFileSync(plist, launchAgent(process.execPath, entry, state, binary, path), { mode: 0o600 });
  const launcher = join(homedir(), '.local/bin/pdo');
  mkdirSync(dirname(launcher), { recursive: true });
  const script = `#!/bin/sh\nexport PAGEPATCH_HOME=${quote(state)}\nexec ${quote(process.execPath)} ${quote(entry)} "$@"\n`;
  for (const name of ['pdo', 'pointdom'])
    writeFileSync(join(dirname(launcher), name), script, { mode: 0o755 });
  try {
    execFileSync('launchctl', ['bootstrap', `gui/${process.getuid!()}`, plist], { stdio: 'pipe' });
  } catch {
    unlinkSync(plist);
    throw new Error('后台服务注册失败，请检查 macOS 登录会话');
  }
  return launcher;
}
export function uninstallService() {
  if (process.platform !== 'darwin') throw new Error('自动启动目前支持 macOS');
  if (!existsSync(file())) return;
  execFileSync('launchctl', ['bootout', `gui/${process.getuid!()}`, file()], { stdio: 'pipe' });
  unlinkSync(file());
  // Preserve bindings, history, pairing and the CLI so the user can reinstall.
}
