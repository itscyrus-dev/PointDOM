import { z } from 'zod';

export const preferencesSchema = z.object({
  version: z.literal(1).catch(1),
  mode: z.enum(['dark', 'light', 'system']).catch('dark'),
  accent: z.literal('lime').catch('lime'),
  language: z.enum(['zh-CN', 'en']).catch('zh-CN'),
  shape: z.literal('rounded').catch('rounded'),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const readPreferences = (value: unknown): Preferences =>
  preferencesSchema.parse(value && typeof value === 'object' && !Array.isArray(value) ? value : {});
export const defaultPreferences = readPreferences({});
