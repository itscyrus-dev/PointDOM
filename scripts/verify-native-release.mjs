import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checksum, releaseTarget, releaseVersion, verifyChecksums } from './release-utils.ts';

const output = 'dist/release';
const version = await releaseVersion('.', process.env.RELEASE_TAG || undefined);
const { triple } = process.argv.includes('--all')
  ? releaseTarget('darwin', 'arm64')
  : releaseTarget(process.platform, process.arch);
const manifest = `${triple}.sha256`;
const names = await verifyChecksums(output, manifest);
if (names.length !== 1 || !names[0].endsWith('.dmg') || !names[0].includes(version))
  throw Error('Expected only the versioned macOS DMG');
const unexpected = (await readdir(output)).filter(
  (name) => ![...names, manifest, 'SHA256SUMS'].includes(name),
);
if (unexpected.length) throw Error(`Unexpected release assets: ${unexpected.join(', ')}`);
await writeFile(join(output, 'SHA256SUMS'), `${await checksum(output, names[0])}  ${names[0]}\n`);
console.log('Verified macOS application and checksums.');
