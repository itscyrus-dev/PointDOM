import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskDescription, taskTitle } from '../src/shared/task-title.js';

test('overall request takes priority and title uses its first sentence', () => {
  const task = {
    instruction: '  按钮靠右。保持现有颜色。\n缩小间距。 ',
    selections: [{ description: '替换图标。' }],
  };
  assert.equal(taskTitle(task), '按钮靠右。');
  assert.equal(taskDescription(task), task.instruction.trim());
});

test('historical per-element tasks use the first nonempty user note in both languages', () => {
  for (const instruction of [
    '按独立描述修改 3 个元素',
    'Apply the individual descriptions to 3 elements',
  ]) {
    const task = {
      instruction,
      selections: [
        { description: ' ' },
        { description: '统一图标大小。保留按钮宽度。' },
        { description: '第二个元素靠右。' },
      ],
    };
    const original = structuredClone(task);
    assert.equal(taskTitle(task), '统一图标大小。');
    assert.equal(taskDescription(task), '统一图标大小。保留按钮宽度。');
    assert.deepEqual(task, original);
  }
});

test('single-selection history and missing instructions retain useful fallbacks', () => {
  assert.equal(
    taskTitle({ instruction: '按独立描述修改 1 个元素', selection: { description: '缩小字体' } }),
    '缩小字体',
  );
  assert.equal(
    taskTitle({ instruction: '', selections: [{ description: '修复布局' }] }),
    '修复布局',
  );
  assert.equal(taskTitle({ instruction: '按独立描述修改 1 个元素' }), '按独立描述修改 1 个元素');
});

test('English sentences, newlines and abbreviations remain readable', () => {
  assert.equal(
    taskTitle({ instruction: 'Align the buttons. Keep their colors.' }),
    'Align the buttons.',
  );
  assert.equal(
    taskTitle({ instruction: '\nFix v1.2 spacing\nKeep the logo.' }),
    'Fix v1.2 spacing',
  );
  assert.equal(
    taskTitle({ instruction: '按独立描述修改 2 个元素的颜色。保持间距。' }),
    '按独立描述修改 2 个元素的颜色。',
  );
});
