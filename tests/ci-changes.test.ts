import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { documentationOnly } from '../scripts/ci-changes.js';

test('documentation fast lane excludes runtime assets, code and workflow changes', () => {
  assert.equal(documentationOnly(['README.md', 'README.zh-CN.md', 'docs/MCP.md']), true);
  for (const path of [
    'docs/assets/pointdom.svg',
    'src/desktop/renderer.tsx',
    '.github/workflows/ci.yml',
    'Cargo.lock',
    'package.json',
    'AGENTS.md',
  ]) {
    assert.equal(documentationOnly(['README.md', path]), false, path);
  }
  assert.equal(documentationOnly([]), false);
});

test('git classification includes deleted code in a rename and fails closed for an unknown base', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pointdom-ci-diff-'));
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: directory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const commit = () => {
    git('add', '.');
    git(
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      '-c',
      'commit.gpgSign=false',
      'commit',
      '-qm',
      'Fixture',
    );
    return git('rev-parse', 'HEAD').trim();
  };
  const classify = (base: string, head: string) => {
    const output = join(directory, '.git', 'ci-output');
    writeFileSync(output, '');
    execFileSync(process.execPath, [resolve('scripts/ci-changes.ts')], {
      cwd: directory,
      env: { ...process.env, CI_BASE_SHA: base, GITHUB_SHA: head, GITHUB_OUTPUT: output },
      stdio: 'pipe',
    });
    return readFileSync(output, 'utf8').trim();
  };
  try {
    git('init', '-q', '--initial-branch=fixture');
    mkdirSync(join(directory, 'docs'));
    writeFileSync(join(directory, 'code.ts'), 'export const fixture = true;\n');
    writeFileSync(join(directory, 'README.md'), '# Fixture\n');
    const base = commit();
    writeFileSync(join(directory, 'README.md'), '# Updated fixture\n');
    const docs = commit();
    assert.equal(classify(base, docs), 'documentation-only=true');
    git('mv', 'code.ts', 'docs/moved.md');
    const moved = commit();
    assert.equal(classify(docs, moved), 'documentation-only=false');
    assert.equal(classify('0'.repeat(40), moved), 'documentation-only=false');
    assert.equal(classify(moved, moved), 'documentation-only=false');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
