// Collect license texts from both native and frontend dependency graphs.
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { build } from 'esbuild';
const metadata = JSON.parse(
  execFileSync('cargo', ['metadata', '--locked', '--format-version', '1'], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  }),
);
let output = 'PointDOM: third-party dependency notices\n';
const append = async (name, version, license, directory) => {
  output += `\n===== ${name} ${version} (${license || 'see source'}) =====\n`;
  for (const file of (await readdir(directory)).filter((name) =>
    /^(license|copying|notice)(\.|-|$)/i.test(name),
  )) {
    try {
      output += `\n${file}\n${await readFile(join(directory, file), 'utf8')}\n`;
    } catch (error) {
      if (error.code !== 'EISDIR') throw error;
    }
  }
};
for (const pkg of metadata.packages
  .filter((p) => p.source)
  .sort((a, b) => a.name.localeCompare(b.name)))
  await append(pkg.name, pkg.version, pkg.license, dirname(pkg.manifest_path));
const bundles = await build({
  entryPoints: [
    'src/extension/panel.tsx',
    'src/extension/background.ts',
    'src/extension/content.ts',
    'src/extension/locator.ts',
    'src/extension/toolbar.ts',
    'src/desktop/renderer.tsx',
  ],
  bundle: true,
  platform: 'browser',
  target: 'safari15',
  format: 'iife',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  outdir: 'unused',
  write: false,
  metafile: true,
});
const included = new Set(
  Object.values(bundles.metafile.outputs).flatMap((output) =>
    Object.entries(output.inputs)
      .filter(([, input]) => input.bytesInOutput > 0)
      .map(([name]) => name),
  ),
);
const packages = new Set();
for (const input of included) {
  if (!input.includes('node_modules/')) continue;
  let directory = dirname(resolve(input));
  while (directory !== dirname(directory)) {
    let pkg;
    try {
      pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (pkg?.name) {
      const key = `${pkg.name}@${pkg.version}`;
      if (!packages.has(key)) {
        packages.add(key);
        await append(pkg.name, pkg.version, pkg.license, directory);
      }
      break;
    }
    directory = dirname(directory);
  }
}
await mkdir('dist/native', { recursive: true });

const gravityPackage = JSON.parse(
  await readFile('node_modules/@iconify-json/gravity-ui/package.json', 'utf8'),
);
await append(
  gravityPackage.name,
  gravityPackage.version,
  gravityPackage.license,
  'node_modules/@iconify-json/gravity-ui',
);
await append('Lucide Languages icon', '', 'ISC', 'src/shared/icons');
await writeFile('dist/native/THIRD_PARTY_NOTICES.txt', output);
