import { build } from 'esbuild';
import { mkdir, copyFile, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist/extension', { recursive: true });
await build({
  entryPoints: ['src/bridge/main.ts', 'src/bridge/mcp.ts'],
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  packages: 'external',
  outdir: 'dist/bridge',
});
await build({
  entryPoints: [
    'src/extension/background.ts',
    'src/extension/panel.ts',
    'src/extension/content.ts',
    'src/extension/toolbar.ts',
  ],
  bundle: true,
  platform: 'browser',
  target: 'chrome120',
  format: 'iife',
  outdir: 'dist/extension',
  minify: false,
});
for (const name of ['manifest.json', 'panel.html', 'panel.css'])
  await copyFile(`src/extension/${name}`, `dist/extension/${name}`);
console.log('Ready: dist/extension and dist/bridge/main.js');
