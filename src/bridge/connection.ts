import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { pathToFileURL } from 'node:url';
import { stableMcpEntry } from './release-paths.js';

export const connectionApp = z.enum(['opencode', 'codex', 'claude']);
/** Export only launch metadata. Never serialize the pairing token or model credentials. */
export function connectionConfig(
  state: string,
  entry: string,
): {
  mcpServers: Record<string, { command: string; args: string[]; env: { PAGEPATCH_HOME: string } }>;
} {
  // The host config is installation-scoped; project selection happens through MCP tools.
  if (!existsSync(entry))
    throw new Error('MCP entry not found. Reinstall PointDOM or run pnpm build.');
  entry = stableMcpEntry(pathToFileURL(entry).href);
  return {
    mcpServers: {
      pointdom: {
        command: process.execPath,
        args: [resolve(entry)],
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
