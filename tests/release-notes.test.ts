import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseNotes, type ReleaseCommit } from '../src/shared/release-notes.js';
const commit = (sha: string, message: string, login: string | null): ReleaseCommit => ({
  sha,
  html_url: `https://github.com/example/repo/commit/${sha}`,
  author: login ? { login } : null,
  commit: { message, author: { name: 'Local Author' } },
});
test('release notes include initial history, categories, commit links and each author without emails or duplicate commits', () => {
  const feature = commit('1234567abc', 'feat(ui): add picker\n\nPrivate body', 'alice');
  const text = releaseNotes('example/repo', 'v0.1.0', undefined, [
    feature,
    commit('2345678abc', 'fix: preserve drafts', 'bob'),
    feature,
    commit('3456789abc', 'docs: <script> & *format*', null),
  ]);
  assert.match(text, /3 commits/);
  assert.match(text, /3 contributors/);
  assert.match(text, /## Highlights/);
  assert.match(text, /## New features/);
  assert.match(text, /## Bug fixes/);
  assert.match(text, /### @alice/);
  assert.match(text, /### @bob/);
  assert.match(text, /### Local Author/);
  assert.match(text, /commits\/v0.1.0/);
  assert.equal(text.includes('Private body'), false);
  assert.equal(text.includes('<script>'), false);
});
test('later releases link the bounded comparison and empty ranges remain valid', () => {
  const text = releaseNotes('example/repo', 'v0.2.0', 'v0.1.0', []);
  assert.match(text, /0 commits/);
  assert.match(text, /since v0.1.0/);
  assert.match(text, /compare\/v0.1.0...v0.2.0/);
  assert.equal(text.includes('## Contributors'), false);
});
