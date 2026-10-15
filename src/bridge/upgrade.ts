import { z } from 'zod';
import { version } from './version.js';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

export function verifyInstaller(script: string, sums: string) {
  const expected = sums
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .find((parts) => parts[1] === 'install.sh')?.[0];
  if (
    !expected ||
    !/^[a-f0-9]{64}$/.test(expected) ||
    createHash('sha256').update(script).digest('hex') !== expected
  )
    throw new Error('Installer checksum mismatch. Your installation was not changed.');
}
export async function upgrade(entry: string) {
  if (process.platform !== 'darwin') throw new Error('Automatic upgrades support macOS only.');
  console.log('Checking the latest PointDOM release...');
  const release = await fetch(
    'https://api.github.com/repos/itscyrus-dev/PointDOM/releases/latest',
    { signal: AbortSignal.timeout(60000) },
  );
  if (!release.ok) throw new Error('Could not check the latest release. Try again later.');
  const { tag_name: tag } = z
    .object({ tag_name: z.string().regex(/^v\d+\.\d+\.\d+$/) })
    .parse(await release.json());
  if (tag === `v${version}`) {
    console.log(`PointDOM ${version} is already up to date.`);
    return;
  }
  const base = `https://github.com/itscyrus-dev/PointDOM/releases/download/${tag}`;
  const response = await fetch(`${base}/install.sh`, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error('Could not download the latest installer. Try again later.');
  const script = await response.text();
  const checksums = await fetch(`${base}/SHA256SUMS`, { signal: AbortSignal.timeout(60000) });
  if (!checksums.ok)
    throw new Error('Release checksums unavailable. Your installation was not changed.');
  verifyInstaller(script, await checksums.text());
  const directory = mkdtempSync(join(tmpdir(), 'pointdom-upgrade-'));
  try {
    const path = join(directory, 'install.sh');
    writeFileSync(path, script, { mode: 0o700 });
    execFileSync('/bin/sh', [path, '--upgrade'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        POINTDOM_RELEASE_BASE_URL: base,
        POINTDOM_UPGRADE_NODE: process.execPath,
        POINTDOM_UPGRADE_CLI: entry,
      },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
