import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTaskDuration } from '../src/extension/task-duration.js';

test('task duration formats recorded execution time in both languages', () => {
  const startedAt = '2026-10-15T00:00:00.000Z';
  for (const [milliseconds, chinese, english] of [
    [0, '不足1秒', '<1s'],
    [999, '不足1秒', '<1s'],
    [59000, '59秒', '59s'],
    [60000, '1分', '1m'],
    [83000, '1分23秒', '1m 23s'],
    [3600000, '1小时', '1h'],
    [3723000, '1小时2分3秒', '1h 2m 3s'],
    [90000000, '25小时', '25h'],
  ] as const) {
    const job = {
      status: 'completed' as const,
      startedAt,
      finishedAt: new Date(Date.parse(startedAt) + milliseconds).toISOString(),
    };
    assert.equal(formatTaskDuration(job, 'zh-CN'), chinese);
    assert.equal(formatTaskDuration(job, 'en'), english);
  }
});

test('duration never guesses from creation or update time, or from unfinished and invalid records', () => {
  const job = {
    status: 'completed' as const,
    createdAt: '2026-10-14T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
    startedAt: '2026-10-15T00:00:00.000Z',
    finishedAt: '2026-10-15T00:01:23.000Z',
  };
  assert.equal(formatTaskDuration(job, 'zh-CN'), '1分23秒');
  for (const overrides of [
    { startedAt: undefined },
    { finishedAt: undefined },
    { startedAt: 'invalid' },
    { finishedAt: 'invalid' },
    { finishedAt: '2026-10-14T00:00:00.000Z' },
    { status: 'running' as const },
    { status: 'failed' as const },
    { status: 'cancelled' as const },
  ]) {
    assert.equal(formatTaskDuration({ ...job, ...overrides }, 'zh-CN'), undefined);
  }
});
