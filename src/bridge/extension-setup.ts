import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { fixedExtensionDirectory } from './release-paths.js';

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

type Run = (command: string, args: string[], input?: string) => void;
/** Requests normal OS actions; Chrome's Load unpacked confirmation stays with the user. */
export function openExtensionSetup(
  path: string,
  platform: string = process.platform,
  run: Run = (command, args, input) => {
    execFileSync(command, args, { input, stdio: 'pipe', timeout: 10000 });
  },
  mode: 'install' | 'reload' = 'install',
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
  return result;
}

export interface ExtensionSetup {
  path: string;
  platform: string;
  pathCopied: boolean;
  folderOpened: boolean;
  chromeOpened: boolean;
}

/** One set of truthful instructions for both setup and the recovery command. */
export function extensionSetupInstructions(
  setup: ExtensionSetup,
  mode: 'install' | 'reload' = 'install',
) {
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
    ];
  if (setup.folderOpened) lines.push('Requested the extension folder selected in Finder.');
  if (setup.pathCopied) lines.push('Extension folder path copied to clipboard.');
  lines.push('1. Enable Developer mode.', '2. Click Load unpacked.');
  lines.push(
    setup.platform === 'darwin'
      ? `3. Press Cmd+Shift+G, ${setup.pathCopied ? 'paste the copied path' : `enter ${setup.path}`}, press Return, then click Select.`
      : `3. Select the whole extension folder: ${setup.path}`,
  );
  lines.push('Need the folder again? Run pdo extension.');
  return lines;
}
