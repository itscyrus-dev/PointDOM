import { mkdir, cp, writeFile, rm, readdir } from 'node:fs/promises';
import { resolve, dirname, basename, join } from 'node:path';
import { checksum, releaseTarget, releaseVersion } from './release-utils.ts';

const version = await releaseVersion('.', process.env.RELEASE_TAG || undefined);
const { triple } = releaseTarget(process.platform, process.arch);
const output = resolve('dist/release');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const bundles = await readdir('target/release/bundle', { recursive: true, withFileTypes: true });
const matches = bundles
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name))
  .filter(
    (file) =>
      file.endsWith('.dmg') &&
      basename(dirname(file)) === 'dmg' &&
      basename(file).includes(version),
  );
if (matches.length !== 1)
  throw Error(`Expected exactly one DMG installer, found ${matches.length}`);
const name = basename(matches[0]);
await cp(matches[0], join(output, name));
await writeFile(join(output, `${triple}.sha256`), `${await checksum(output, name)}  ${name}\n`);
console.log(`Release app ready: ${name}`);
