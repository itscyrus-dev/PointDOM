import { build } from 'esbuild';
import { mkdir, cp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, dirname, basename } from 'node:path';
const { browserBundle } = await import('./build.mjs');
const output = resolve('dist/release');
const app = resolve('dist/package/pointdom');
await rm(resolve('dist/package'), { recursive: true, force: true });
await mkdir(output, { recursive: true });
await mkdir(`${app}/dist/bridge`, { recursive: true });
const bundle = await build({
  metafile: true,
  entryPoints: ['src/bridge/main.ts', 'src/bridge/mcp.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  banner: {
    js: "import { createRequire as pointdomCreateRequire } from 'node:module'; const require = pointdomCreateRequire(import.meta.url);",
  },
  outdir: `${app}/dist/bridge`,
});
const packages = new Map();
// Only attribute code actually emitted. Empty markers such as client-only are
// resolved by the bundler but contribute no files or code to the distribution.
const shippedInputs = new Set(
  Object.values({ ...bundle.metafile.outputs, ...browserBundle.metafile.outputs }).flatMap(
    (output) =>
      Object.entries(output.inputs)
        .filter(([, info]) => info.bytesInOutput > 0)
        .map(([input]) => input),
  ),
);
for (const input of shippedInputs) {
  if (!input.includes('node_modules/')) continue;
  let folder = dirname(resolve(input));
  while (folder !== dirname(folder)) {
    try {
      const info = JSON.parse(await readFile(`${folder}/package.json`, 'utf8'));
      if (info.name && info.version) {
        packages.set(`${info.name}@${info.version}`, folder);
        break;
      }
    } catch {
      /* Continue to the dependency package root. */
    }
    folder = dirname(folder);
  }
}
let notices = '';
for (const [name, folder] of [...packages].sort()) {
  const files = (await readdir(folder)).filter((file) => /^(licen[cs]e|copying)(\.|$)/i.test(file));
  const metadata = JSON.parse(await readFile(`${folder}/package.json`, 'utf8'));
  if (!files.length && metadata.license === 'SEE LICENSE IN README.md') files.push('README.md');
  if (!files.length) throw new Error(`Dependency license missing: ${name}`);
  notices += `\n===== ${name} =====\n`;
  for (const file of files)
    notices += `${basename(file)}\n${await readFile(`${folder}/${file}`, 'utf8')}\n`;
}
await writeFile(`${app}/THIRD_PARTY_NOTICES.txt`, notices);
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
await writeFile(
  `${app}/package.json`,
  JSON.stringify({ name: 'pointdom', version: pkg.version, type: 'module' }),
);
await cp('dist/extension', `${app}/dist/extension`, { recursive: true });
await cp('README.md', `${app}/README.md`);
await cp('CHANGELOG.md', `${app}/CHANGELOG.md`);
await cp('README.zh-CN.md', `${app}/README.zh-CN.md`);
await cp('docs', `${app}/docs`, { recursive: true });
await cp('AGENTS.md', `${app}/AGENTS.md`);
await cp('DESIGN.md', `${app}/DESIGN.md`);
await cp('CONTRIBUTING.md', `${app}/CONTRIBUTING.md`);
await cp('SECURITY.md', `${app}/SECURITY.md`);
await cp('CODE_OF_CONDUCT.md', `${app}/CODE_OF_CONDUCT.md`);
await writeFile(
  `${app}/INSTALL.md`,
  '# Installation\n\nSee [the installation runbook](docs/INSTALL_AGENT.md).\n',
);
await cp('LICENSE', `${app}/LICENSE`);
await writeFile(
  `${output}/install.sh`,
  (await readFile('install.sh', 'utf8')).replace(
    'https://github.com/itscyrus-dev/PointDOM/releases/latest/download',
    `https://github.com/itscyrus-dev/PointDOM/releases/download/v${pkg.version}`,
  ),
);
execFileSync('tar', [
  '-czf',
  `${output}/pointdom.tar.gz`,
  '-C',
  resolve('dist/package'),
  'pointdom',
]);
execFileSync('zip', ['-qr', `${output}/pointdom-extension.zip`, '.'], {
  cwd: resolve('dist/extension'),
});
const assets = ['pointdom.tar.gz', 'pointdom-extension.zip', 'install.sh'];
const hashes = await Promise.all(
  assets.map(
    async (name) =>
      `${createHash('sha256')
        .update(await readFile(`${output}/${name}`))
        .digest('hex')}  ${name}`,
  ),
);
await writeFile(`${output}/SHA256SUMS`, `${hashes.join('\n')}\n`);
console.log('Release assets ready in dist/release (not published)');
