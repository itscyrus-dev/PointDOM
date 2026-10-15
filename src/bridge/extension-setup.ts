import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export function extensionDirectory(entry: string) {
  const path = fileURLToPath(new URL('../extension/', entry));
  if (!existsSync(new URL('../extension/manifest.json', entry)))
    throw new Error('Extension files not found. Reinstall PointDOM or run pnpm build.');
  return realpathSync(path);
}

type Run = (command: string, args: string[], input?: string) => void;
/** Requests normal OS actions; Chrome's Load unpacked confirmation stays with the user. */
export function openExtensionSetup(
  path: string,
  platform: string = process.platform,
  run: Run = (command, args, input) => {
    execFileSync(command, args, { input, stdio: 'pipe', timeout: 10000 });
  },
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
  result.pathCopied = attempt('/usr/bin/pbcopy', [], path);
  result.folderOpened = attempt('/usr/bin/open', [path]);
  result.chromeOpened = attempt('/usr/bin/open', ['-a', 'Google Chrome', 'chrome://extensions/']);
  return result;
}
