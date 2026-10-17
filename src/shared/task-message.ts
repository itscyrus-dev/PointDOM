import type { Cancellation } from './contracts.js';
/** Translate native service codes without changing client-authored progress or reports. */
export function taskMessage(code: string, translate: (zh: string, en: string) => string): string {
  const messages: Record<string, [string, string]> = {
    CLIENT_CONNECTION_CHANGED: [
      '客户端连接已变化，请重新启用任务通知',
      'Client connection changed; enable task notifications again',
    ],
    CLIENT_NOTIFYING: ['正在通知客户端', 'Notifying client'],
    CLIENT_NOTIFIED: ['已通知客户端', 'Client notified'],
    CLIENT_NOTIFY_UNCONFIRMED: [
      '通知未确认，请检查客户端；不会自动重发',
      'Notification unconfirmed; check your client. No automatic resend.',
    ],
    CLIENT_NOT_CLAIMED: [
      '客户端未领取任务，请检查 MCP 连接',
      'Client did not claim the task; check its MCP connection',
    ],
    SERVICE_STOPPED: [
      '本地服务已停止，请检查客户端中的任务状态',
      'Local service stopped; check the task in your client',
    ],
    SERVICE_RESTARTED_REVIEW_BEFORE_RETRY: [
      '服务重启，任务已中断；请检查已有修改后重新提交',
      'Task interrupted by restart; inspect changes before resubmitting',
    ],
  };
  const message = messages[code];
  return message ? translate(...message) : code;
}

export function cancellationMessage(
  result: Cancellation,
  t: (zh: string, en: string) => string,
): string {
  if (!result.cancelled) return t('任务已结束，无需取消。', 'Task already ended.');
  if (result.notification === 'sent')
    return t(
      '批注已取消，已向 Codex 发送停止请求。',
      'Annotation cancelled. Stop request sent to Codex.',
    );
  if (result.notification === 'unconfirmed')
    return t(
      '批注已取消；Codex 通知未确认，请在客户端停止。',
      'Annotation cancelled. Codex notification unconfirmed; stop in the client.',
    );
  if (result.notification === 'manual')
    return t(
      '批注已取消；正在执行的操作请在客户端停止。',
      'Annotation cancelled. Stop ongoing edits in your client.',
    );
  return t('批注已取消。', 'Annotation cancelled.');
}
