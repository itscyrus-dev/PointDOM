import { z } from 'zod';
export const cliIdSchema = z.enum(['codex', 'claude', 'opencode', 'trae']);
export type CliId = z.infer<typeof cliIdSchema>;
export const cliIds = cliIdSchema.options;
export const cliStatusSchema = z.object({
  id: cliIdSchema,
  available: z.boolean(),
  reason: z.enum(['detected', 'missing', 'unsupported']),
});
export type CliStatus = z.infer<typeof cliStatusSchema>;
