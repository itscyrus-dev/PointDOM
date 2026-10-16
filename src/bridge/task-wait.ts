import { setTimeout as delay } from 'node:timers/promises';
import type { Store } from './store.js';
import type { AgentConnections } from './agent-connections.js';

/** Wait without claiming: the normal atomic claim route remains authoritative. */
export async function waitForTask(
  store: Store,
  agents: AgentConnections,
  projectId: string,
  claim: string,
  timeoutMs: number,
  signal: AbortSignal,
) {
  const session = agents.session(projectId, claim);
  if (!session) throw new Error('MCP_RECONNECT_REQUIRED');
  const stop = agents.beginWait(session.id);
  if (!stop) throw new Error('MCP_WAIT_ALREADY_ACTIVE');
  const deadline = Date.now() + timeoutMs;
  try {
    while (true) {
      signal.throwIfAborted();
      if (!agents.session(projectId, claim)?.listening) throw new Error('MCP_SESSION_CLOSED');
      const busy = store.jobs.some(
        (job) => job.projectId === projectId && ['running', 'waiting'].includes(job.status),
      );
      const task =
        !busy &&
        store.jobs.find(
          (job) =>
            job.projectId === projectId &&
            job.executor === 'mcp' &&
            job.recipient?.id === session.id &&
            job.status === 'queued',
        );
      if (task) return { taskId: task.id, connectionId: session.id, timedOut: false };
      const remaining = deadline - Date.now();
      if (remaining <= 0) return { taskId: null, connectionId: session.id, timedOut: true };
      await delay(Math.min(250, remaining), undefined, { signal });
    }
  } finally {
    stop();
  }
}
