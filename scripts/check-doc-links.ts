import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const files = execFileSync('git', ['ls-files', '-z', '--', '*.md'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
const missing: string[] = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  const links = [
    ...text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g),
    ...text.matchAll(/(?:src|href)="([^"]+)"/g),
  ];
  for (const match of links) {
    const target = match[1]!.replace(/^<|>$/g, '');
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#')) continue;
    const path = decodeURIComponent(target.split(/[?#]/)[0]!);
    if (!existsSync(resolve(dirname(file), path))) missing.push(`${file}: ${target}`);
  }
}
if (missing.length) throw Error(`Missing local documentation targets:\n${missing.join('\n')}`);
console.log(`Verified local links in ${files.length} Markdown files.`);
