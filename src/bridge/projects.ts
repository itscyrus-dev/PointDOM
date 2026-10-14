import { realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, parse } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Store } from './store.js';
export const bindingSchema = z
  .object({
    path: z.string().min(1),
    name: z.string().trim().min(1).max(80),
    origin: z.string().url(),
    model: z
      .string()
      .max(200)
      .regex(/^[^/\s]+\/.+$/)
      .optional(),
  })
  .strict();
export function bindProject(store: Store, input: z.infer<typeof bindingSchema>) {
  const cwd = realpathSync(resolve(input.path));
  if (!statSync(cwd).isDirectory() || cwd === parse(cwd).root || cwd === homedir())
    throw new Error('请选择具体代码项目，不能绑定根目录或用户目录');
  const url = new URL(input.origin);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅支持 http/https 网页');
  let project = store.config.projects.find((p) => p.cwd === cwd);
  if (project) {
    project.name = input.name;
    if (!project.origins.includes(url.origin)) project.origins.push(url.origin);
    if (input.model) project.openCodeModel = input.model;
  } else {
    project = {
      id: randomUUID(),
      cwd,
      name: input.name,
      origins: [url.origin],
      ...(input.model ? { openCodeModel: input.model } : {}),
    };
    store.config.projects.push(project);
  }
  store.saveConfig();
  return project;
}
