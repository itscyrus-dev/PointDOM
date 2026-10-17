import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdir, copyFile, cp, rm, writeFile } from 'node:fs/promises';
import { paletteStyles } from '../src/extension/ui-palette.ts';
await rm('dist/extension', { recursive: true, force: true });
await rm('dist/bridge', { recursive: true, force: true });
await rm('dist/desktop-resources', { recursive: true, force: true });
await mkdir('dist/extension', { recursive: true });
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
await import('./desktop/assets.mjs');
await copyFile('dist/desktop-app/gravity.svg', 'dist/extension/gravity.svg');
execFileSync('cargo', ['build', '--locked', '-p', 'pointdom-cli'], { stdio: 'inherit' });
await mkdir('dist/native', { recursive: true });
await cp(
  `target/debug/pointdom${process.platform === 'win32' ? '.exe' : ''}`,
  'dist/native/pointdom',
);
await import('./notices.mjs');
console.log('Ready: dist/extension and dist/desktop-app; native service builds with Cargo.');
