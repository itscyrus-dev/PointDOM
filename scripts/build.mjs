import { build } from 'esbuild';
import { mkdir, copyFile, cp, rm, writeFile } from 'node:fs/promises';
import { paletteStyles } from '../src/extension/ui-palette.ts';
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
export const browserBundle = await build({
  entryPoints: [
    'src/extension/background.ts',
    'src/extension/panel.tsx',
    'src/extension/content.ts',
    'src/extension/locator.ts',
    'src/extension/toolbar.ts',
  ],
  bundle: true,
  platform: 'browser',
  target: 'chrome120',
  format: 'iife',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  metafile: true,
  outdir: 'dist/extension',
  minify: true,
});
for (const name of ['manifest.json', 'panel.html', 'panel.css'])
  await copyFile(`src/extension/${name}`, `dist/extension/${name}`);
await copyFile('node_modules/@heroui/styles/dist/heroui.min.css', 'dist/extension/heroui.css');
await writeFile('dist/extension/palette.css', paletteStyles());
await cp('src/extension/_locales', 'dist/extension/_locales', { recursive: true });
await cp('src/extension/icons', 'dist/extension/icons', { recursive: true });
console.log('Ready: dist/extension and dist/bridge/main.js');
