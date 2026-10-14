import { z } from 'zod';
export const selectionSchema = z.object({
  url: z
    .string()
    .url()
    .max(2048)
    .refine((v) => /^https?:/.test(v)),
  title: z.string().max(300),
  selector: z.string().max(3000),
  label: z.string().max(500),
  description: z.string().max(2000).optional(),
  tag: z.string().max(40),
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
export const submissionSchema = z
  .object({
    executor: z.enum(['codex', 'opencode', 'mcp']).optional(),
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    instruction: z.string().trim().min(1).max(8000),
    selection: selectionSchema,
    selections: z.array(selectionSchema).min(1).max(10).optional(),
    execution: executionSchema.optional(),
  })
  .strict();
export type Submission = z.infer<typeof submissionSchema>;
export const projectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(80),
  cwd: z.string().min(1),
  origins: z.array(z.string().url()).min(1),
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
  agent?: string;
  claim?: string;
  commit?: z.infer<typeof commitSchema>;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  events: { at: string; text: string }[];
  result: string;
  error?: string;
  threadId?: string;
  approval?: Approval;
};
export const terminal = (status: JobStatus) =>
  ['completed', 'failed', 'cancelled', 'interrupted'].includes(status);

export const jobSchema = submissionSchema.extend({
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
  events: z.array(z.object({ at: z.string(), text: z.string() })),
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
