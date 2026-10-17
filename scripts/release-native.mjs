import { execFileSync } from 'node:child_process';
import { mkdir, cp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { resolve, dirname, basename, join } from 'node:path';
import { zipSync } from 'fflate';
import { checksum, releaseTarget, releaseVersion } from './release-utils.ts';

const version = await releaseVersion('.', process.env.RELEASE_TAG || undefined);
const { triple, installers } = releaseTarget(process.platform, process.arch);
const host = execFileSync('rustc', ['-vV'], { encoding: 'utf8' }).match(/^host: (.+)$/m)?.[1];
if (host !== triple) throw Error(`Expected native toolchain ${triple}, received ${host}`);
const output = resolve('dist/release');
const root = resolve('dist/native-package/pointdom');
await rm(output, { recursive: true, force: true });
await rm(root, { recursive: true, force: true });
await mkdir(root, { recursive: true });
await mkdir(output, { recursive: true });
const executable = process.platform === 'win32' ? 'pointdom.exe' : 'pointdom';
await cp('dist/native/pointdom', join(root, executable));
await cp('dist/extension', join(root, 'extension'), { recursive: true });
for (const name of ['LICENSE', 'README.md', 'README.zh-CN.md', 'CHANGELOG.md'])
  await cp(name, join(root, name));
await cp('dist/native/THIRD_PARTY_NOTICES.txt', join(root, 'THIRD_PARTY_NOTICES.txt'));

async function zip(directory, prefix = '') {
  const files = {};
  for (const name of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (!name.isFile()) continue;
    const path = join(name.parentPath, name.name);
    const relative = path.slice(directory.length + 1).replaceAll('\\', '/');
    files[prefix + relative] = new Uint8Array(await readFile(path));
  }
  return zipSync(files);
}
const names = [];
const archive = `pointdom-${version}-${triple}.${process.platform === 'win32' ? 'zip' : 'tar.gz'}`;
if (process.platform === 'win32')
  await writeFile(join(output, archive), await zip(root, 'pointdom/'));
else execFileSync('tar', ['-czf', join(output, archive), '-C', dirname(root), basename(root)]);
names.push(archive);
// One platform owns the portable extension ZIP so parallel artifacts never collide.
if (process.platform === 'darwin') {
  const extension = `pointdom-extension-${version}.zip`;
  await writeFile(join(output, extension), await zip(resolve('dist/extension')));
  names.push(extension);
}
const bundles = (await readdir('target/release/bundle', { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name));
const bundleDirectories = { '.dmg': 'dmg', '.exe': 'nsis', '.deb': 'deb', '.AppImage': 'appimage' };
for (const suffix of installers) {
  const matches = bundles.filter(
    (file) =>
      file.endsWith(suffix) &&
      basename(dirname(file)) === bundleDirectories[suffix] &&
      basename(file).includes(version),
  );
  if (matches.length !== 1)
    throw Error(`Expected exactly one ${suffix} installer, found ${matches.length}`);
  const name = basename(matches[0]);
  await cp(matches[0], join(output, name));
  names.push(name);
}
const checks = await Promise.all(
  names.sort().map(async (name) => `${await checksum(output, name)}  ${name}`),
);
await writeFile(join(output, `${triple}.sha256`), checks.join('\n') + '\n');
console.log(`Release assets ready: ${triple}, ${names.length} files`);
