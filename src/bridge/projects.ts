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
  })
  .strict();
export function projectDirectory(path: string, base = process.cwd(), home = homedir()) {
  let input = path.trim();
  if (/^(['"]).*\1$/s.test(input)) input = input.slice(1, -1);
  if (!input) throw new Error('Enter the path to your project directory.');
  if (input === '~') input = home;
  else if (input.startsWith('~/')) input = resolve(home, input.slice(2));
  let cwd: string;
  try {
    cwd = realpathSync(resolve(base, input));
    if (!statSync(cwd).isDirectory()) throw new Error('Choose a project directory, not a file.');
  } catch (error) {
    if (error instanceof Error && !('code' in error)) throw error;
    throw new Error('Cannot open this directory. Enter an existing, accessible project folder.');
  }
  if (cwd === parse(cwd).root || cwd === realpathSync(home))
    throw new Error(
      'Choose a specific project directory, not the filesystem root or your home directory.',
    );
  return cwd;
}
export function bindProject(store: Store, input: z.infer<typeof bindingSchema>) {
  const cwd = projectDirectory(input.path);
  const url = new URL(input.origin);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Only http/https project URLs are supported.');
  let project = store.config.projects.find((p) => p.cwd === cwd);
  if (project) {
    project.name = input.name;
    if (!project.origins.includes(url.origin)) project.origins.push(url.origin);
  } else {
    project = {
      id: randomUUID(),
      cwd,
      name: input.name,
      origins: [url.origin],
    };
    store.config.projects.push(project);
  }
  store.saveConfig();
  return project;
}
