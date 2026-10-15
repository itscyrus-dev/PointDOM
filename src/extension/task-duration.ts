import type { Job } from '../shared/contracts.js';
import type { Preferences } from './ui-preferences.js';

export function formatTaskDuration(
  job: Pick<Job, 'status' | 'startedAt' | 'finishedAt'>,
  language: Preferences['language'],
): string | undefined {
  if (job.status !== 'completed' || !job.startedAt || !job.finishedAt) return;
  const elapsed = Date.parse(job.finishedAt) - Date.parse(job.startedAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return;
  const total = Math.floor(elapsed / 1000);
  const chinese = language === 'zh-CN';
  if (total < 1) return chinese ? '不足1秒' : '<1s';
  return [
    [Math.floor(total / 3600), chinese ? '小时' : 'h'],
    [Math.floor((total % 3600) / 60), chinese ? '分' : 'm'],
    [total % 60, chinese ? '秒' : 's'],
  ]
    .filter(([value]) => value !== 0)
    .map(([value, unit]) => `${value}${unit}`)
    .join(chinese ? '' : ' ');
}
