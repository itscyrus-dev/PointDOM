import { mkdirSync, writeFileSync, existsSync, unlinkSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
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
  _retiredBinary: string | undefined,
  path: string,
) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${[node, entry, 'serve'].map((arg) => `<string>${xml(arg)}</string>`).join('')}</array>
<key>WorkingDirectory</key><string>${xml(dirname(entry))}</string>
<key>EnvironmentVariables</key><dict>
${Object.entries({
  PAGEPATCH_HOME: state,
  PATH: path,
})
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
export function installService(state: string) {
  if (process.platform === 'win32') return installWindowsService(state);
  if (process.platform !== 'darwin')
    throw new Error('Login startup supports macOS only. Use pnpm start on other platforms.');
  const entry = fileURLToPath(new URL('./main.js', import.meta.url));
  const path = `${dirname(process.execPath)}:${process.env.PATH || '/usr/bin:/bin'}`;
  const plist = file();
  if (existsSync(plist))
    throw new Error(
      'The background service is already installed. Run pdo uninstall before updating; this stops active tasks.',
    );
  mkdirSync(dirname(plist), { recursive: true });
  mkdirSync(state, { recursive: true, mode: 0o700 });
  writeFileSync(plist, launchAgent(process.execPath, entry, state, undefined, path), {
    mode: 0o600,
  });
  const launcher = join(homedir(), '.local/bin/pdo');
  mkdirSync(dirname(launcher), { recursive: true });
  const script = `#!/bin/sh\nexport PAGEPATCH_HOME=${quote(state)}\nexec ${quote(process.execPath)} ${quote(entry)} "$@"\n`;
  for (const name of ['pdo', 'pointdom'])
    writeFileSync(join(dirname(launcher), name), script, { mode: 0o755 });
  try {
    execFileSync('launchctl', ['bootstrap', `gui/${process.getuid!()}`, plist], { stdio: 'pipe' });
  } catch {
    unlinkSync(plist);
    throw new Error('Could not register the background service. Check your macOS login session.');
  }
  return launcher;
}
export async function uninstallService(state: string) {
  if (process.platform === 'win32') {
    const shortcut = windowsShortcut();
    if (existsSync(join(state, 'bridge.pid'))) {
      // Never kill a stale/reused PID: authenticate the running bridge and compare its PID.
      const config = JSON.parse(readFileSync(join(state, 'config.json'), 'utf8')) as {
        token: string;
      };
      const response = await fetch('http://127.0.0.1:4318/api/local/status', {
        headers: { Authorization: `Bearer ${config.token}`, 'X-PagePatch-Local': '1' },
        signal: AbortSignal.timeout(5000),
      });
      const status: unknown = await response.json();
      if (
        !response.ok ||
        !status ||
        typeof status !== 'object' ||
        !('pid' in status) ||
        status.pid !== Number(readFileSync(join(state, 'bridge.pid'), 'utf8'))
      )
        throw new Error('Could not verify the running service. No process was stopped.');
      process.kill(status.pid as number);
    }
    if (existsSync(shortcut)) unlinkSync(shortcut);
    return;
  }
  if (process.platform !== 'darwin') throw new Error('Login startup supports macOS only.');
  if (!existsSync(file())) return;
  execFileSync('launchctl', ['bootout', `gui/${process.getuid!()}`, file()], { stdio: 'pipe' });
  unlinkSync(file());
  // Preserve bindings, history, pairing and the CLI so the user can reinstall.
}

const psQuote = (value: string) => `'${value.replaceAll("'", "''")}'`;
export function windowsServiceCommand(node: string, entry: string, state: string) {
  return `$env:PAGEPATCH_HOME=${psQuote(state)}; & ${psQuote(node)} ${psQuote(entry)} serve`;
}
const encoded = (command: string) => Buffer.from(command, 'utf16le').toString('base64');
function windowsShortcut() {
  if (!process.env.APPDATA)
    throw new Error('APPDATA is unavailable. Use a normal Windows user session.');
  return join(process.env.APPDATA, 'Microsoft/Windows/Start Menu/Programs/Startup/PointDOM.lnk');
}
export function startService(state: string) {
  if (process.platform === 'darwin') {
    execFileSync('launchctl', ['kickstart', `gui/${process.getuid!()}/${label}`], {
      stdio: 'pipe',
      timeout: 10000,
    });
  } else if (process.platform === 'win32') {
    const entry = fileURLToPath(new URL('./main.js', import.meta.url));
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-WindowStyle',
        'Hidden',
        '-EncodedCommand',
        encoded(windowsServiceCommand(process.execPath, entry, state)),
      ],
      { detached: true, stdio: 'ignore', windowsHide: true },
    );
    child.on('error', () => {}); // Readiness is checked by the calling installer.
    child.unref();
  } else throw new Error('Login startup supports macOS and Windows.');
}
function installWindowsService(state: string) {
  const shortcut = windowsShortcut();
  if (existsSync(shortcut))
    throw new Error('PointDOM login startup already exists. Use pdo start to restart it.');
  const entry = fileURLToPath(new URL('./main.js', import.meta.url));
  mkdirSync(dirname(shortcut), { recursive: true });
  mkdirSync(state, { recursive: true });
  const bin = join(homedir(), '.local/bin');
  mkdirSync(bin, { recursive: true });
  // Paths are quoted batch literals; percent expansion must also be escaped.
  const batch = (value: string) => value.replaceAll('%', '%%');
  const script = `@echo off\r\nset "PAGEPATCH_HOME=${batch(state)}"\r\n"${batch(process.execPath)}" "${batch(entry)}" %*\r\n`;
  for (const name of ['pdo.cmd', 'pointdom.cmd']) writeFileSync(join(bin, name), script);
  const arguments_ = `-NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${encoded(windowsServiceCommand(process.execPath, entry, state))}`;
  const command = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut(${psQuote(shortcut)}); $s.TargetPath=(Get-Command powershell.exe).Source; $s.Arguments=${psQuote(arguments_)}; $s.WindowStyle=7; $s.Description='PointDOM local service'; $s.Save()`;
  execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded(command)],
    { stdio: 'pipe', windowsHide: true, timeout: 15000 },
  );
  startService(state);
  return join(bin, 'pdo.cmd');
}
