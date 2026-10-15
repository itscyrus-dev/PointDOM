import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { z } from 'zod';
import { pathToFileURL } from 'node:url';
import { stableMcpEntry } from './release-paths.js';

export const connectionApp = z.enum(['opencode', 'codex', 'claude']);
const projectsSchema = z.object({
  projects: z.array(z.object({ cwd: z.string() })),
});

/** Export only launch metadata. Never serialize the pairing token or model credentials. */
export function connectionConfig(
  config: unknown,
  projectPath: string,
  state: string,
  entry: string,
) {
  const cwd = realpathSync(projectPath);
  if (!projectsSchema.parse(config).projects.some((project) => project.cwd === cwd))
    throw new Error(
      'Project not linked. Run pdo connect --origin http://localhost:5173 from your project.',
    );
  if (!existsSync(entry))
    throw new Error('MCP entry not found. Reinstall PointDOM or run pnpm build.');
  entry = stableMcpEntry(pathToFileURL(entry).href);
  // Fixed release entries retain the server ID across upgrades. Source checkouts
  // still include their entry path so separate installations cannot collide.
  const suffix = createHash('sha256')
    .update(JSON.stringify([cwd, entry]))
    .digest('hex')
    .slice(0, 12);
  const name = `pointdom-${basename(cwd)
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 32)}-${suffix}`;
  return {
    mcpServers: {
      [name]: {
        command: process.execPath,
        args: [resolve(entry), '--project', cwd],
        env: { PAGEPATCH_HOME: resolve(state) },
      },
    },
  };
}

export function connectionLink(config: ReturnType<typeof connectionConfig>, app: string) {
  const target = connectionApp.parse(app);
  const params = new URLSearchParams({
    resource: 'mcp',
    apps: target,
    config: Buffer.from(JSON.stringify(config), 'utf8').toString('base64'),
  });
  return `ccswitch://v1/import?${params}`;
}
