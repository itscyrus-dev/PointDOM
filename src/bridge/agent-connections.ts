import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AgentConnection } from '../shared/contracts.js';

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .regex(/^[^\u0000-\u001f\u007f]+$/u);
export const connectionRegistration = z.object({
  projectId: z.string().uuid(),
  claim: z.string().uuid(),
  client: z.object({ name: text(160), version: text(80) }),
});

/** Presence only. Public IDs are not capabilities; the private stdio session proves ownership. */
export class AgentConnections {
  private records = new Map<string, AgentConnection>();
  constructor(private readonly now: () => number = Date.now) {}
  private id(projectId: string, claim: string) {
    const hex = createHash('sha256').update(`pointdom-session:${projectId}:${claim}`).digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  }
  private prune() {
    for (const [id, record] of this.records)
      if (this.now() - Date.parse(record.lastSeenAt) > 45_000) this.records.delete(id);
  }
  register(input: z.infer<typeof connectionRegistration>) {
    this.prune();
    const id = this.id(input.projectId, input.claim);
    const existing = this.records.get(id);
    if (!existing && this.records.size >= 256) throw new Error('Too many active MCP connections.');
    const at = new Date(this.now()).toISOString();
    const connection: AgentConnection = existing
      ? { ...existing, lastSeenAt: at }
      : { id, projectId: input.projectId, ...input.client, connectedAt: at, lastSeenAt: at };
    this.records.set(id, connection);
    return connection;
  }
  beginWait(id: string) {
    const record = this.records.get(id);
    if (!record || record.listening) return undefined;
    record.listening = true;
    return () => {
      const current = this.records.get(id);
      if (current) current.listening = false;
    };
  }
  disconnect(projectId: string, claim: string) {
    this.records.delete(this.id(projectId, claim));
  }
  get(id: string, projectId: string) {
    this.prune();
    const connection = this.records.get(id);
    return connection?.projectId === projectId ? connection : undefined;
  }
  session(projectId: string, claim: string) {
    return this.get(this.id(projectId, claim), projectId);
  }
  list(projectId: string) {
    this.prune();
    return [...this.records.values()].filter((connection) => connection.projectId === projectId);
  }
}
