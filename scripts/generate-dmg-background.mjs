import { mkdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

// Commit the rendered PNG so packaging does not depend on browser fonts or a browser install.
const folder = 'src-tauri/dmg';
await mkdir(folder, { recursive: true });
const svg = await readFile(`${folder}/background.svg`, 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 640, height: 400 },
    deviceScaleFactor: 2,
  });
  await page.setContent(`<style>html,body{margin:0}svg{display:block}</style>${svg}`);
  await page.screenshot({ path: `${folder}/background.png` });
} finally {
  await browser.close();
}
// Finder uses the physical image size; keep the 2x artwork at 640 × 400 points.
execFileSync('sips', [
  '-s',
  'dpiWidth',
  '144',
  '-s',
  'dpiHeight',
  '144',
  `${folder}/background.png`,
]);
