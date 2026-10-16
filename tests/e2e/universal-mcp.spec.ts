import { fixtureCli } from '../fixtures/cli.js';
import { test, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { serve } from '@hono/node-server';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../../src/bridge/store.js';
import { Queue } from '../../src/bridge/queue.js';
import { createApp } from '../../src/bridge/server.js';

test('one MCP process binds multiple projects with explicit scope and isolated recipients', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'pointdom-universal-')));
  const store = new Store(join(dir, 'state'));
  for (const name of ['alpha', 'beta']) {
    const cwd = join(dir, name);
    mkdirSync(cwd);
    store.config.projects.push({
      id: randomUUID(),
      name,
      cwd,
      origins: [`http://localhost:${name === 'alpha' ? 5173 : 5174}`],
    });
  }
  store.saveConfig();
  const queue = new Queue(store, fixtureCli(dir));
  let app: ReturnType<typeof createApp>;
  const server = serve({ fetch: (request) => app.fetch(request), hostname: '127.0.0.1', port: 0 });
  await new Promise<void>((resolve) =>
    server.listening ? resolve() : server.once('listening', resolve),
  );
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  app = createApp(store, queue, address.port);
  const entry = join(dir, 'mcp.mjs');
  writeFileSync(
    entry,
    readFileSync(resolve('dist/bridge/mcp.js'), 'utf8').replaceAll(
      '127.0.0.1:4318',
      `127.0.0.1:${address.port}`,
    ),
  );
  symlinkSync(resolve('node_modules'), join(dir, 'node_modules'));
  const client = new Client({ name: 'opencode', version: 'fixture' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    cwd: store.config.projects[0]!.cwd,
    env: { ...(process.env as Record<string, string>), PAGEPATCH_HOME: store.directory },
  });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toContain('pointdom_bind_project');
    expect(queue.agents.list(store.config.projects[0]!.id)).toHaveLength(0);
    const call = (name: string, args: Record<string, unknown> = {}) =>
      client.callTool({ name, arguments: args });
    expect((await call('pointdom_bind_project', { path: '.' })).isError).toBe(true);
    const unbound = await call('pointdom_list_tasks');
    expect(unbound.isError).toBe(true);
    expect(JSON.stringify(unbound)).toContain('projectId');
    const [a, b] = store.config.projects;
    for (const project of [a!, b!]) {
      const result = await call('pointdom_bind_project', { path: project.cwd });
      expect(result.isError).not.toBe(true);
      expect(JSON.stringify(result)).toContain(project.id);
    }
    const ca = queue.agents.list(a!.id)[0]!,
      cb = queue.agents.list(b!.id)[0]!;
    expect(ca.id).not.toBe(cb.id);
    const [ra, rb] = await Promise.all([
      call('pointdom_list_tasks', { projectId: a!.id }),
      call('pointdom_list_tasks', { projectId: b!.id }),
    ]);
    expect(JSON.stringify(ra)).toContain('alpha');
    expect(JSON.stringify(rb)).toContain('beta');
    expect((await call('pointdom_list_tasks')).isError).toBe(true);
    // Rebinding is idempotent and never switches an implicit shared project.
    await call('pointdom_bind_project', { path: a!.cwd });
    expect(queue.agents.list(a!.id)).toHaveLength(1);
    expect(queue.agents.list(a!.id)[0]!.id).toBe(ca.id);
    const submit = (project: typeof a, recipientId: string) =>
      queue.submit({
        id: randomUUID(),
        projectId: project!.id,
        recipientId,
        instruction: 'Fixture change',
        selection: {
          url: project!.origins[0]! + '/',
          title: 'Fixture',
          selector: 'h1',
          label: 'Heading',
          tag: 'h1',
          viewport: { width: 800, height: 600 },
          rect: { x: 0, y: 0, width: 100, height: 20 },
          styles: {},
        },
      });
    const taskA = submit(a, ca.id),
      taskB = submit(b, cb.id);
    expect((await call('pointdom_get_task', { projectId: b!.id, taskId: taskA.id })).isError).toBe(
      true,
    );
    expect(
      (await call('pointdom_claim_task', { projectId: b!.id, taskId: taskA.id, agent: 'fixture' }))
        .isError,
    ).toBe(true);
    const waits = await Promise.all(
      [a!, b!].map((project) =>
        call('pointdom_wait_for_task', { projectId: project.id, timeoutSeconds: 1 }),
      ),
    );
    expect(JSON.stringify(waits[0])).toContain(taskA.id);
    expect(JSON.stringify(waits[1])).toContain(taskB.id);
    for (const [project, task] of [
      [a!, taskA],
      [b!, taskB],
    ] as const) {
      expect(
        (
          await call('pointdom_claim_task', {
            projectId: project.id,
            taskId: task.id,
            agent: 'fixture',
          })
        ).isError,
      ).not.toBe(true);
      expect(
        (
          await call('pointdom_progress_task', {
            projectId: project.id,
            taskId: task.id,
            stepId: 'check',
            message: 'Fixture verified',
          })
        ).isError,
      ).not.toBe(true);
      expect(
        (
          await call('pointdom_report_task', {
            projectId: project.id,
            taskId: task.id,
            outcome: 'completed',
            summary: 'Fixture only',
            files: [],
            verification: 'No application code executed',
          })
        ).isError,
      ).not.toBe(true);
      expect(task.status).toBe('completed');
    }
    const unknown = await call('pointdom_bind_project', { path: dir });
    expect(unknown.isError).toBe(true);
    const missing = await call('pointdom_list_tasks', { projectId: randomUUID() });
    expect(missing.isError).toBe(true);
  } finally {
    await client.close().catch(() => {});
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    rmSync(dir, { recursive: true, force: true });
  }
});
