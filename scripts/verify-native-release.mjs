import { execFileSync } from 'node:child_process';
import { readFile, readdir, mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { unzipSync } from 'fflate';
import {
  assetName,
  checksum,
  releaseTarget,
  releaseTargets,
  releaseVersion,
  verifyChecksums,
} from './release-utils.ts';

const output = 'dist/release';
const version = await releaseVersion('.', process.env.RELEASE_TAG || undefined);
const aggregate = process.argv.includes('--all');
const targets = aggregate
  ? Object.values(releaseTargets)
  : [releaseTarget(process.platform, process.arch)];
const names = [];
for (const { triple, installers } of targets) {
  const assets = await verifyChecksums(output, `${triple}.sha256`);
  if (
    !assets.includes(
      `pointdom-${version}-${triple}.${triple.includes('windows') ? 'zip' : 'tar.gz'}`,
    )
  )
    throw Error(`Missing CLI archive: ${triple}`);
  for (const suffix of installers)
    if (assets.filter((name) => name.endsWith(suffix)).length !== 1)
      throw Error(`Missing installer: ${triple} ${suffix}`);
  for (const name of assets) {
    if (names.includes(name)) throw Error(`Duplicate platform asset: ${name}`);
    names.push(name);
  }
}
if (aggregate || process.platform === 'darwin') {
  if (!names.includes(`pointdom-extension-${version}.zip`)) throw Error('Missing extension ZIP');
}
if (aggregate) {
  const expected = [...names, ...targets.map(({ triple }) => `${triple}.sha256`)];
  const unexpected = (await readdir(output)).filter(
    (name) => name !== 'SHA256SUMS' && !expected.includes(name),
  );
  if (unexpected.length) throw Error(`Unexpected release assets: ${unexpected.join(', ')}`);
  await writeFile(
    join(output, 'SHA256SUMS'),
    (
      await Promise.all(
        names.sort().map(async (name) => `${await checksum(output, name)}  ${name}`),
      )
    ).join('\n') + '\n',
  );
} else {
  const triple = targets[0].triple;
  const archive = names.find((name) => name.startsWith(`pointdom-${version}-${triple}.`));
  const directory = await mkdtemp(join(tmpdir(), 'pointdom-package-'));
  try {
    let entries;
    if (archive.endsWith('.zip')) {
      const files = unzipSync(new Uint8Array(await readFile(join(output, archive))));
      entries = Object.keys(files);
      for (const name of entries) {
        if (
          !name.startsWith('pointdom/') ||
          name.split('/').some((part) => part === '..' || part.includes('\\'))
        )
          throw Error('Unexpected archive path');
        const path = join(directory, name);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, files[name]);
      }
    } else {
      entries = execFileSync('tar', ['-tzf', join(output, archive)], { encoding: 'utf8' })
        .trim()
        .split('\n');
      if (entries.some((name) => !name.startsWith('pointdom/') || name.split('/').includes('..')))
        throw Error('Unexpected archive path');
      execFileSync('tar', ['-xzf', join(output, archive), '-C', directory]);
    }
    if (entries.some((name) => /node_modules|dist\/bridge|app\.asar|runtime\/bin\/node/.test(name)))
      throw Error('Unexpected runtime in archive');
    const executable = join(
      directory,
      'pointdom',
      process.platform === 'win32' ? 'pointdom.exe' : 'pointdom',
    );
    if (execFileSync(executable, ['version'], { encoding: 'utf8' }).trim() !== version)
      throw Error('Native executable version mismatch');
    const extension = execFileSync(executable, ['extension', '--path'], {
      encoding: 'utf8',
    }).trim();
    if (extension !== join(directory, 'pointdom', 'extension'))
      throw Error('Native extension path mismatch');
    await readFile(join(extension, 'manifest.json'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
const manifest = JSON.parse(await readFile('dist/extension/manifest.json', 'utf8'));
if (manifest.permissions.includes('debugger') || manifest.host_permissions.includes('<all_urls>'))
  throw Error('Unexpected extension permission');
for (const name of names) assetName(name);
console.log(`Verified ${names.length} release assets across ${targets.length} platform(s).`);
