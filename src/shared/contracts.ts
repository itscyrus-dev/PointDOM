import { z } from 'zod';
const domAttributesSchema = z
  .record(z.string().max(40), z.string().max(200))
  .refine((value) => Object.keys(value).length <= 16);
const domSummarySchema = z.object({
  tag: z.string().max(40),
  attributes: domAttributesSchema,
  label: z.string().max(120),
});
export const domSnapshotSchema = z
  .object({
    capturedAt: z.iso.datetime(),
    html: z.string().max(3200),
    attributes: domAttributesSchema,
    ancestors: z.array(domSummarySchema).max(4),
    siblings: z.array(domSummarySchema.extend({ relation: z.enum(['previous', 'next']) })).max(2),
    truncated: z.boolean(),
  })
  .refine((value) => new TextEncoder().encode(JSON.stringify(value)).length <= 10000);
export const selectionSchema = z.object({
  url: z
    .string()
    .url()
    .max(2048)
    .refine((v) => /^https?:/.test(v)),
  title: z.string().max(300),
  selector: z.string().max(3000),
  selectorPath: z.array(z.string().min(1).max(3000)).min(1).max(8).optional(),
  dom: domSnapshotSchema.optional(),
  label: z.string().max(500),
  description: z.string().max(2000).optional(),
  tag: z.string().max(40),
  role: z.string().max(40).optional(),
  viewport: z.object({
    width: z.number().int().positive().max(20000),
    height: z.number().int().positive().max(20000),
  }),
  rect: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
  }),
  styles: z
    .record(z.string().max(60), z.string().max(200))
    .refine((v) => Object.keys(v).length <= 30),
});
export type Selection = z.infer<typeof selectionSchema>;
export function readSelections(value: unknown): Selection[] {
  const parsed = z
    .array(selectionSchema)
    .max(10)
    .safeParse(Array.isArray(value) ? value : value ? [value] : []);
  return parsed.success ? parsed.data : [];
}
export const executionSchema = z
  .object({
    model: z.string().min(1).max(100).optional(),
    effort: z.string().min(1).max(30).optional(),
    serviceTier: z.string().min(1).max(50).optional(),
    autoCommit: z.boolean().optional(),
    approvalPolicy: z.enum(['on-request', 'untrusted', 'never']).default('on-request'),
  })
  .strict();
export type Execution = z.infer<typeof executionSchema>;
export type ModelChoice = {
  model: string;
  name: string;
  isDefault: boolean;
  efforts: string[];
  defaultEffort: string;
  tiers: { id: string; name: string }[];
};
export const executorSchema = z.enum(['codex', 'opencode', 'claude', 'trae', 'mcp']);
export type Executor = z.infer<typeof executorSchema>;
export const agentSettingsSchema = z.object({
  defaultExecutor: executorSchema,
  traeAutoSend: z.boolean(),
});
export function executorName(executor: Executor = 'codex') {
  return {
    codex: 'Codex',
    opencode: 'OpenCode',
    claude: 'Claude Code',
    trae: 'Trae',
    mcp: 'Agent · MCP',
  }[executor];
}
export const agentConnectionSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1).max(160),
  version: z.string().max(80),
  connectedAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
});
export type AgentConnection = z.infer<typeof agentConnectionSchema>;
export const taskRecipientSchema = agentConnectionSchema.pick({ id: true, name: true });
export const submissionSchema = z
  .object({
    executor: executorSchema.optional(),
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    recipientId: z.string().uuid().optional(),
    instruction: z.string().trim().min(1).max(8000),
    selection: selectionSchema,
    selections: z.array(selectionSchema).min(1).max(10).optional(),
    execution: executionSchema.optional(),
  })
  .strict();
export type Submission = z.infer<typeof submissionSchema>;
export const projectPermissionsSchema = z
  .object({
    confirmation: z.enum(['default', 'reduced']),
    codexNetwork: z.boolean(),
  })
  .strict();
export type ProjectPermissions = z.infer<typeof projectPermissionsSchema>;
export const defaultProjectPermissions: ProjectPermissions = {
  confirmation: 'default',
  codexNetwork: false,
};
export const traeConversationSchema = z
  .object({
    appId: z.string().regex(/^[\w.-]{1,120}$/),
    conversation: z.string().trim().min(1).max(300),
  })
  .strict();
export type TraeConversation = z.infer<typeof traeConversationSchema>;
export const projectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  cwd: z.string().min(1),
  origins: z.array(z.string().url()).min(1),
  permissions: projectPermissionsSchema.optional(),
  traeHandoff: traeConversationSchema.optional(),
  openCodeModel: z
    .string()
    .max(200)
    .regex(/^[^/\s]+\/.+$/)
    .optional(),
});
export type Project = z.infer<typeof projectSchema>;
export type Approval = {
  id: string;
  kind: 'command' | 'files' | 'questions';
  title: string;
  details: string;
  questions?: { id: string; question: string; options: string[] }[];
};
export const replySchema = z
  .object({
    decision: z.enum(['accept', 'decline']).optional(),
    answers: z.record(z.string(), z.string().max(4000)).optional(),
  })
  .strict();
export type Reply = z.infer<typeof replySchema>;
export type JobStatus =
  | 'queued'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';
export const commitSchema = z.object({
  status: z.enum(['ready', 'committed', 'failed', 'unavailable']),
  root: z.string().optional(),
  head: z.string().optional(),
  files: z.record(z.string(), z.string()).optional(),
  hash: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
});
export type Job = Submission & {
  recipient?: z.infer<typeof taskRecipientSchema>;
  permissions?: ProjectPermissions;
  delivery?: Delivery;
  agent?: string;
  claim?: string;
  commit?: z.infer<typeof commitSchema>;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  events: { at: string; text: string; progressId?: string }[];
  result: string;
  error?: string;
  threadId?: string;
  approval?: Approval;
};
export const terminal = (status: JobStatus) =>
  ['completed', 'failed', 'cancelled', 'interrupted'].includes(status);

export const deliverySchema = z.object({
  target: executorSchema,
  fingerprint: z.string().length(64),
  state: z.enum(['cli', 'pending', 'pasted', 'copied', 'blocked', 'uncertain']),
  detail: z.string().max(600).optional(),
  autoSend: traeConversationSchema.optional(),
  automatic: z.boolean().optional(),
  sentAt: z.iso.datetime().optional(),
  attemptedAt: z.iso.datetime().optional(),
});
export type Delivery = z.infer<typeof deliverySchema>;

export const taskProgressSchema = z.object({
  stepId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/),
  message: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value), 'Use a single-line summary.'),
});

export const jobSchema = submissionSchema.extend({
  recipient: taskRecipientSchema.optional(),
  permissions: projectPermissionsSchema.optional(),
  delivery: deliverySchema.optional(),
  agent: z.string().optional(),
  claim: z.string().optional(),
  commit: commitSchema.optional(),
  status: z.enum([
    'queued',
    'running',
    'waiting',
    'completed',
    'failed',
    'cancelled',
    'interrupted',
  ]),
  createdAt: z.string(),
  updatedAt: z.string(),
  startedAt: z.iso.datetime().optional(),
  finishedAt: z.iso.datetime().optional(),
  events: z.array(
    z.object({ at: z.string(), text: z.string(), progressId: z.string().optional() }),
  ),
  result: z.string(),
  error: z.string().optional(),
  threadId: z.string().optional(),
  approval: z
    .object({
      id: z.string(),
      kind: z.enum(['command', 'files', 'questions']),
      title: z.string(),
      details: z.string(),
      questions: z
        .array(z.object({ id: z.string(), question: z.string(), options: z.array(z.string()) }))
        .optional(),
    })
    .optional(),
});
