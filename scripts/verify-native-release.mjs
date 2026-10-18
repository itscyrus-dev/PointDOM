import { readdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { checksum, releaseTarget, releaseVersion, verifyChecksums } from './release-utils.ts';

const output = 'dist/release';
const version = await releaseVersion('.', process.env.RELEASE_TAG || undefined);
const { triple } = process.argv.includes('--all')
  ? releaseTarget('darwin', 'arm64')
  : releaseTarget(process.platform, process.arch);
const manifest = `${triple}.sha256`;
const names = await verifyChecksums(output, manifest);
const archive = `pointdom-extension-${version}.zip`;
if (
  names.length !== 2 ||
  !names.includes(archive) ||
  !names.some((name) => name.endsWith('.dmg') && name.includes(version))
)
  throw Error('Expected the versioned macOS DMG and extension ZIP');
const files = unzipSync(await readFile(join(output, archive)));
if (
  Object.keys(files).some(
    (name) => name.startsWith('/') || name.includes('\\') || name.split('/').includes('..'),
  )
)
  throw Error('Unsafe extension archive path');
const extension = JSON.parse(new TextDecoder().decode(files['manifest.json']));
if (extension.version !== version || extension.manifest_version !== 3)
  throw Error('Extension archive manifest/version mismatch');
for (const path of [
  extension.background?.service_worker,
  extension.side_panel?.default_path,
  ...Object.values(extension.icons || {}),
]) {
  if (!path || !files[path]) throw Error(`Missing extension resource: ${path}`);
}
const unexpected = (await readdir(output)).filter(
  (name) => ![...names, manifest, 'SHA256SUMS'].includes(name),
);
if (unexpected.length) throw Error(`Unexpected release assets: ${unexpected.join(', ')}`);
await writeFile(
  join(output, 'SHA256SUMS'),
  (await Promise.all(names.map(async (name) => `${await checksum(output, name)}  ${name}`))).join(
    '\n',
  ) + '\n',
);
console.log('Verified macOS application, extension ZIP and checksums.');
