import { existsSync, realpathSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { fixedExtensionDirectory } from './release-paths.js';
import { terminalStyle } from './terminal.js';

export function extensionDirectory(entry: string) {
  const path = fileURLToPath(new URL('../extension/', entry));
  if (!existsSync(new URL('../extension/manifest.json', entry)))
    throw new Error('Extension files not found. Reinstall PointDOM or run pnpm build.');
  return realpathSync(path);
}

/** A fixed real directory avoids Chrome deriving a new extension ID from a versioned symlink target. */
export function extensionSetupDirectory(entry: string, prepare = false) {
  return fixedExtensionDirectory(entry, extensionDirectory(entry), prepare);
}

/** Export only bundled extension files, with manifest.json at the ZIP root. */
export function extensionArchive(entry: string) {
  const source = extensionDirectory(entry);
  const directory = mkdtempSync(join(tmpdir(), 'pointdom-extension-'));
  const archive = join(directory, 'pointdom-extension.zip');
  try {
    execFileSync('zip', ['-qr', archive, '.', '-x', '.DS_Store', '.pointdom-managed.json'], {
      cwd: source,
      stdio: 'pipe',
      timeout: 30000,
    });
    return archive;
  } catch {
    rmSync(directory, { recursive: true, force: true });
    throw new Error(
      'Could not create the extension ZIP. Install the zip command or use pdo extension.',
    );
  }
}

type Run = (command: string, args: string[], input?: string) => void;
/** Requests normal OS actions; installing through Chrome remains the user's action. */
export function openExtensionSetup(
  path: string,
  platform: string = process.platform,
  run: Run = (command, args, input) => {
    execFileSync(command, args, { input, stdio: 'pipe', timeout: 10000 });
  },
  mode: 'install' | 'reload' | 'zip' = 'install',
) {
  const result = { folderOpened: false, chromeOpened: false, pathCopied: false };
  if (platform !== 'darwin') return result;
  const attempt = (command: string, args: string[], input?: string) => {
    try {
      run(command, args, input);
      return true;
    } catch {
      return false;
    }
  };
  if (mode === 'install') {
    result.pathCopied = attempt('/usr/bin/pbcopy', [], path);
    result.folderOpened = attempt('/usr/bin/open', ['-R', path]);
  }
  result.chromeOpened = attempt('/usr/bin/open', ['-a', 'Google Chrome', 'chrome://extensions/']);
  if (mode === 'zip') result.folderOpened = attempt('/usr/bin/open', ['-R', path]);
  return result;
}

export interface ExtensionSetup {
  path: string;
  format?: 'zip';
  platform: string;
  pathCopied: boolean;
  folderOpened: boolean;
  chromeOpened: boolean;
}

/** One set of truthful instructions for both setup and the recovery command. */
export function extensionSetupInstructions(
  setup: ExtensionSetup,
  mode: 'install' | 'reload' = 'install',
  color = false,
) {
  const style = terminalStyle(color);
  if (setup.format === 'zip')
    return [
      '',
      `  Extension ZIP: ${style.action(setup.folderOpened ? 'pointdom-extension.zip' : setup.path)}`,
      ...(setup.chromeOpened ? [] : [`  Open ${style.action('chrome://extensions')} in Chrome.`]),
      ...(setup.folderOpened
        ? [style.muted('  Selected in Finder.')]
        : [style.muted('  Find the ZIP at the path above.')]),
      '',
      `  ${style.action('1  Developer mode → ON')}`,
      style.muted('     Chrome extensions page, top right.'),
      '',
      `  ${style.action('2  Drag pointdom-extension.zip from Finder')}`,
      '     Drop it onto the Chrome extensions page.',
      style.muted('     Do not unzip it or click Load unpacked.'),
      '',
      `  ${style.action('3  PointDOM card appears → return here')}`,
      '',
      style.muted('  ZIP extension updates are manual. See pdo extension --help.'),
    ];
  const lines = [
    `Extension folder: ${setup.path}`,
    setup.chromeOpened
      ? 'Requested Chrome extensions page.'
      : 'Open chrome://extensions in Google Chrome.',
  ];
  if (mode === 'reload')
    return [
      ...lines,
      'Click Reload on PointDOM, then refresh your project page.',
      'If Chrome was loaded from an old version folder, run pdo extension and load the fixed folder once.',
      'ZIP-installed copies need manual updates; reloading does not load files from the managed folder.',
    ];
  if (setup.folderOpened) lines.push('Requested the extension folder selected in Finder.');
  if (setup.pathCopied) lines.push('Extension folder path copied to clipboard.');
  lines.push('\nInstall the extension:', '1. In Chrome, turn on Developer mode (top right).');
  if (setup.platform === 'darwin' && setup.folderOpened) {
    lines.push(
      '2. Switch to Finder. Drag the selected extension folder onto the Chrome extensions page.',
      '3. Wait for the PointDOM card to appear, then return to this terminal.',
      '\nIf dragging is unavailable, use the folder chooser:',
    );
  }
  lines.push('Click Load unpacked (top left).');
  if (setup.platform === 'darwin')
    lines.push(
      'In the folder chooser, not the Chrome address bar:',
      `Press Cmd+Shift+G, ${setup.pathCopied ? 'paste the copied path' : `enter ${setup.path}`}, then press Return.`,
      'Click Select / Open. Select the extension folder itself; do not select its parent or a file inside it.',
    );
  else lines.push(`Select the whole extension folder: ${setup.path}`);
  lines.push(
    'The correct folder contains manifest.json directly. Wait for the PointDOM card to appear.',
  );
  lines.push('Need the folder again? Run pdo extension.');
  lines.push(
    'Prefer a ZIP? Run pdo extension --zip. ZIP installs require manual extension updates.',
  );
  return lines;
}
