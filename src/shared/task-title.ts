type TaskText = {
  instruction: string;
  selection?: { description?: string };
  selections?: { description?: string }[];
};

export function taskDescription(task: TaskText): string {
  const instruction = task.instruction.trim();
  // Older element-only submissions stored a generated instruction instead of a user title.
  const generated =
    /^(?:按独立描述修改 \d+ 个元素|Apply the individual descriptions to \d+ elements)$/.test(
      instruction,
    );
  if (instruction && !generated) return instruction;
  return (
    task.selections?.find((item) => item.description?.trim())?.description?.trim() ||
    task.selection?.description?.trim() ||
    instruction
  );
}

export function taskTitle(task: TaskText): string {
  const line =
    taskDescription(task)
      .split(/\r?\n/)
      .find((value) => value.trim())
      ?.trim() || '';
  return (
    new Intl.Segmenter(undefined, { granularity: 'sentence' })
      .segment(line)
      [Symbol.iterator]()
      .next()
      .value?.segment.trim() || line
  );
}
