import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { format, resolveConfig } from 'prettier';
import { logoSvg } from '../src/extension/brand.ts';

const folder = 'src/extension/icons';
await mkdir(folder, { recursive: true });
const svg = logoSvg();
const formatted = await format(svg, {
  ...(await resolveConfig('docs/assets/pointdom.svg')),
  parser: 'html',
});
await writeFile('docs/assets/pointdom.svg', formatted);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const size of [16, 32, 48, 128]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0;width:100%;height:100%;background:transparent}svg{display:block;width:100%;height:100%}</style>${svg}`,
    );
    await page.screenshot({ path: `${folder}/icon-${size}.png`, omitBackground: true });
  }
} finally {
  await browser.close();
}
console.log('PointDOM SVG and 16/32/48/128px Chrome icons generated.');
