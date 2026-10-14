import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { Job } from '../shared/contracts.js';

export type GitSnapshot = { root: string; head: string; files: Record<string, string> };
function git(cwd: string, args: string[]) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
function fingerprint(path: string) {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() && !stat.isSymbolicLink()) throw new Error('不支持提交子模块或特殊文件');
    const content = stat.isSymbolicLink() ? readlinkSync(path) : readFileSync(path);
    return createHash('sha256').update(String(stat.mode)).update(content).digest('hex');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return 'deleted';
    throw e;
  }
}
export function snapshot(cwd: string): GitSnapshot {
  const root = realpathSync(git(cwd, ['rev-parse', '--show-toplevel']).trim());
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  const status = git(cwd, [
    '-c',
    'status.renames=false',
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
    '--',
    '.',
  ]);
  const files: Record<string, string> = {};
  for (const row of status.split('\0').filter(Boolean)) {
    if (row.slice(0, 2).includes('U') || ['AA', 'DD'].includes(row.slice(0, 2)))
      throw new Error('请先解决 Git 冲突');
    const path = row.slice(3);
    files[path] = row.slice(0, 2) + ':' + fingerprint(join(root, path));
  }
  return { root, head, files };
}
export function prepareCommit(cwd: string, before: GitSnapshot | undefined, job: Job) {
  if (!before) {
    job.commit = {
      status: 'unavailable',
      error: '任务开始时未能记录 Git 状态，无法确定本次提交范围。',
    };
    return;
  }
  try {
    const after = snapshot(cwd);
    if (after.root !== before.root || after.head !== before.head)
      throw new Error('任务期间 Git 提交发生变化，请在项目中检查并提交。');
    for (const [path, value] of Object.entries(before.files)) {
      if (after.files[path] !== value)
        throw new Error('本次修改涉及原有未提交文件，请在项目中检查并提交。');
    }
    const files = Object.fromEntries(
      Object.entries(after.files).filter(([path]) => !(path in before.files)),
    );
    job.commit = Object.keys(files).length
      ? { status: 'ready', root: after.root, head: after.head, files }
      : { status: 'unavailable', error: '没有可单独提交的新改动。' };
  } catch (e) {
    job.commit = {
      status: 'unavailable',
      error: e instanceof Error ? e.message : '无法检查 Git 状态',
    };
  }
}
export function commitJob(cwd: string, job: Job) {
  const state = job.commit;
  if (state?.status === 'committed') return;
  if (!state?.root || !state.head || !state.files || !['ready', 'failed'].includes(state.status))
    throw new Error(state?.error || '该任务没有可安全提交的改动');
  const current = snapshot(cwd);
  if (current.root !== state.root || current.head !== state.head)
    throw new Error('Git 提交已变化，请在项目中检查并提交。');
  const paths = Object.keys(state.files);
  for (const path of paths)
    if (current.files[path] !== state.files[path])
      throw new Error('任务完成后文件又有修改，请在项目中检查并提交。');
  if (!paths.length) throw new Error('没有可提交的改动');
  const subject = job.instruction
    .replace(/[\r\n\x00-\x1f]+/g, ' ')
    .trim()
    .slice(0, 64);
  const message = `fix: ${subject}\n\nPagePatch-Task: ${job.id}`;
  // --only excludes unrelated staged files. Intent-to-add lets Git include new files
  // without staging their content; on failure restore the original index for our paths.
  const newPaths = paths.filter((path) => state.files![path]!.startsWith('??:'));
  try {
    if (newPaths.length)
      git(cwd, [
        '--literal-pathspecs',
        'add',
        '--intent-to-add',
        '--',
        ...newPaths.map((p) => join(current.root, p)),
      ]);
    git(cwd, [
      '--literal-pathspecs',
      'commit',
      '--only',
      '-m',
      message,
      '--',
      ...paths.map((p) => join(current.root, p)),
    ]);
    state.status = 'committed';
    state.hash = git(cwd, ['rev-parse', 'HEAD']).trim();
    state.message = message;
    delete state.error;
  } catch {
    if (newPaths.length)
      git(cwd, [
        '--literal-pathspecs',
        'reset',
        '-q',
        'HEAD',
        '--',
        ...newPaths.map((p) => join(current.root, p)),
      ]);
    throw new Error('本地 Commit 失败，请检查 Git 用户信息、提交钩子或仓库状态后重试。');
  }
}
