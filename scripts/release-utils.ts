import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const releaseTargets = {
  'darwin-arm64': { triple: 'aarch64-apple-darwin', installers: ['.dmg'] },
  'win32-x64': { triple: 'x86_64-pc-windows-msvc', installers: ['.exe'] },
  'linux-x64': { triple: 'x86_64-unknown-linux-gnu', installers: ['.deb', '.AppImage'] },
} as const;

export function releaseTarget(platform: string, arch: string) {
  const key = `${platform}-${arch}`;
  if (!(key in releaseTargets)) throw Error(`Unsupported release platform: ${key}`);
  return releaseTargets[key as keyof typeof releaseTargets];
}

export async function releaseVersion(root = '.', tag?: string) {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const tauri = JSON.parse(await readFile(join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
  const extension = JSON.parse(await readFile(join(root, 'src/extension/manifest.json'), 'utf8'));
  const cargo = await readFile(join(root, 'Cargo.toml'), 'utf8');
  const rust = cargo.match(/\[workspace.package\][\s\S]*?\bversion\s*=\s*"([^"]+)"/)?.[1];
  if (
    !/^\d+\.\d+\.\d+$/.test(pkg.version) ||
    [tauri.version, extension.version, rust].some((version) => version !== pkg.version) ||
    (tag !== undefined && tag !== `v${pkg.version}`)
  )
    throw Error('Release tag/package/Cargo/Tauri/extension version mismatch');
  return pkg.version as string;
}

export function assetName(name: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/.test(name) || name.includes('..'))
    throw Error(`Invalid release asset name: ${name}`);
  return name;
}

export async function checksum(directory: string, name: string) {
  return createHash('sha256')
    .update(await readFile(join(directory, assetName(name))))
    .digest('hex');
}

export async function verifyChecksums(directory: string, manifest: string) {
  const lines = (await readFile(join(directory, manifest), 'utf8')).trim().split('\n');
  if (!lines[0]) throw Error('Empty checksum manifest');
  const names = new Set<string>();
  for (const line of lines) {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/);
    if (!match) throw Error('Invalid checksum entry');
    const name = assetName(match[2]!);
    if (names.has(name)) throw Error(`Duplicate release asset: ${name}`);
    names.add(name);
    if ((await checksum(directory, name)) !== match[1]) throw Error(`Checksum mismatch: ${name}`);
  }
  return [...names];
}
