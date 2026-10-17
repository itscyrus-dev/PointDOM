import { themeStyles } from '../../src/extension/ui-palette.ts';
import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
const app = 'dist/desktop-app';
await mkdir(app, { recursive: true });
await build({
  entryPoints: ['src/desktop/renderer.tsx'],
  bundle: true,
  platform: 'browser',
  target: 'safari15',
  format: 'iife',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  outfile: `${app}/renderer.js`,
  minify: true,
});
for (const name of ['index.html', 'desktop.css']) await cp(`src/desktop/${name}`, `${app}/${name}`);
await writeFile(
  `${app}/desktop.css`,
  themeStyles() + (await readFile('src/desktop/desktop.css', 'utf8')),
);
await cp('docs/assets/pointdom.svg', `${app}/logo.svg`);
await cp('node_modules/@heroui/styles/dist/heroui.min.css', `${app}/heroui.css`);
// Tauri injects its IPC CSP at bundle time; the plain browser QA build has no network access.
const html = await readFile(`${app}/index.html`, 'utf8');
await writeFile(
  `${app}/index.html`,
  html.replace("connect-src 'none'", 'connect-src ipc: http://ipc.localhost'),
);

// Bundle selected icons as an offline sprite. Languages uses the Lucide icon from HeroUI docs.
const gravity = JSON.parse(
  await readFile('node_modules/@iconify-json/gravity-ui/icons.json', 'utf8'),
);
const names = JSON.parse(await readFile('src/shared/icon-names.json', 'utf8'));
const languageIcon = await readFile('src/shared/icons/languages.svg', 'utf8');
const symbols = Object.entries(names).map(([id, name]) => {
  if (id === 'language')
    return languageIcon.replace('<svg', '<symbol id="language"').replace('</svg>', '</symbol>');
  const icon = gravity.icons[name];
  if (!icon) throw new Error(`Missing Gravity UI icon: ${name}`);
  return `<symbol id="${id}" viewBox="0 0 ${icon.width ?? gravity.width ?? 16} ${icon.height ?? gravity.height ?? 16}">${icon.body}</symbol>`;
});
await writeFile(
  `${app}/gravity.svg`,
  `<svg xmlns="http://www.w3.org/2000/svg">${symbols.join('')}</svg>`,
);
