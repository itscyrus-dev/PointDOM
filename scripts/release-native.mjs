import { mkdir, cp, writeFile, rm, readdir, readFile } from 'node:fs/promises';
import { resolve, dirname, basename, join, relative } from 'node:path';
import { zipSync } from 'fflate';
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
const extension = resolve('dist/extension');
const manifest = JSON.parse(await readFile(join(extension, 'manifest.json'), 'utf8'));
if (manifest.version !== version) throw Error('Built extension version mismatch');
const files = {};
for (const entry of await readdir(extension, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const path = join(entry.parentPath, entry.name);
  files[relative(extension, path).split('\\').join('/')] = new Uint8Array(await readFile(path));
}
const archive = `pointdom-extension-${version}.zip`;
await writeFile(join(output, archive), zipSync(files));
const names = [name, archive];
await writeFile(
  join(output, `${triple}.sha256`),
  (
    await Promise.all(names.map(async (asset) => `${await checksum(output, asset)}  ${asset}`))
  ).join('\n') + '\n',
);
console.log(`Release app and extension ready: ${names.join(', ')}`);
