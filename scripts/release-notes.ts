import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { releaseNotes, type ReleaseCommit } from '../src/shared/release-notes.js';
const tag = process.argv[2];
const output = process.argv[3];
const repo = process.env.GH_REPO || 'itscyrus-dev/PointDOM';
if (!tag || !/^v\d+\.\d+\.\d+(?:[+-][\w.-]+)?$/.test(tag) || !output)
  throw new Error('Usage: pnpm exec tsx scripts/release-notes.ts vVERSION OUTPUT');
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Invalid GH_REPO');
let previous: string | undefined;
try {
  previous = execFileSync(
    'git',
    ['describe', '--tags', '--match', 'v[0-9]*', '--abbrev=0', `${tag}^`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  ).trim();
} catch {
  /* The first release has no previous tag. */
}
const path = previous
  ? `repos/${repo}/compare/${encodeURIComponent(previous)}...${encodeURIComponent(tag)}?per_page=100`
  : `repos/${repo}/commits?sha=${encodeURIComponent(tag)}&per_page=100`;
const pages = JSON.parse(
  execFileSync('gh', ['api', '--paginate', '--slurp', path], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  }),
) as (ReleaseCommit[] | { commits: ReleaseCommit[] })[];
const commits = pages.flatMap((page) => (Array.isArray(page) ? page : page.commits));
writeFileSync(output, releaseNotes(repo, tag, previous, commits));
