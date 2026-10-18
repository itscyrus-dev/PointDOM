import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const guides = new Set([
  'README.md',
  'README.zh-CN.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'DESIGN.md',
  'CHANGELOG.md',
]);

export function documentationOnly(paths: readonly string[]) {
  return paths.length > 0 && paths.every((path) => guides.has(path) || /^docs\/.*\.md$/.test(path));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let docs = false;
  const base = process.env.CI_BASE_SHA || '';
  const head = process.env.GITHUB_SHA || '';
  if ([base, head].every((sha) => /^[0-9a-f]{40,64}$/i.test(sha))) {
    try {
      // Report both paths of renames so moving/deleting code cannot become docs-only.
      const paths = execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', base, head], {
        encoding: 'utf8',
      })
        .split('\0')
        .filter(Boolean);
      docs = documentationOnly(paths);
    } catch {
      console.log('Diff unavailable; full native checks required.');
    }
  }
  appendFileSync(process.env.GITHUB_OUTPUT!, `documentation-only=${docs}\n`);
}
