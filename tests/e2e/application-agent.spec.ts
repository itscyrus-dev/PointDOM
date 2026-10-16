import { test, expect } from '@playwright/test';
import { mkdtempSync, realpathSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { Store } from '../../src/bridge/store.js';
import { Queue } from '../../src/bridge/queue.js';
import { createApp } from '../../src/bridge/server.js';
import { fixtureCli } from '../fixtures/cli.js';
import { cliIds } from '../../src/shared/cli.js';
test('four CLI adapters execute only in the registered project and reject MCP/command overrides', async () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'pointdom-cli-api-')));
  const store = new Store(join(directory, 'state'));
  for (const name of ['a', 'b']) {
    const cwd = join(directory, name);
    mkdirSync(cwd);
    writeFileSync(join(cwd, 'button.css'), 'button{height:32px}');
    store.config.projects.push({
      id: randomUUID(),
      name,
      cwd,
      origins: [`http://localhost:${name === 'a' ? 5173 : 5174}`],
    });
  }
  const queue = new Queue(store, fixtureCli(directory));
  const app = createApp(store, queue);
  const origin = `chrome-extension://${'a'.repeat(32)}`;
  store.config.clients.push(origin);
  const call = (path: string, body?: unknown) =>
    app.request(`http://127.0.0.1:4318${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Host: '127.0.0.1:4318',
        Origin: origin,
        Authorization: `Bearer ${store.config.token}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const a = store.config.projects[0]!,
    b = store.config.projects[1]!;
  const input = () => ({
    id: randomUUID(),
    projectId: a.id,
    instruction: 'Change height',
    selection: {
      url: a.origins[0]!,
      title: 'Fixture',
      selector: 'button',
      label: 'Send',
      tag: 'button',
      viewport: { width: 500, height: 500 },
      rect: { x: 0, y: 0, width: 40, height: 40 },
      styles: {},
    },
  });
  try {
    for (const executor of cliIds) {
      const request = { ...input(), executor };
      expect((await call('/api/jobs', request)).status).toBe(202);
      expect((await call('/api/jobs', request)).status).toBe(202);
      await expect.poll(() => store.jobs.at(-1)?.status).toBe('completed');
      expect(store.jobs.at(-1)?.executor).toBe(executor);
      expect(store.jobs.at(-1)?.recipient).toBeUndefined();
    }
    expect(store.jobs).toHaveLength(4);
    expect(readFileSync(join(a.cwd, 'button.css'), 'utf8')).toContain('40px');
    expect(readFileSync(join(b.cwd, 'button.css'), 'utf8')).toContain('32px');
    expect((await call('/api/jobs', { ...input(), executor: 'mcp' })).status).toBe(410);
    expect((await call('/api/jobs', { ...input(), executor: 'codex', cwd: b.cwd })).status).toBe(
      400,
    );
    expect(
      (
        await call('/api/jobs', {
          ...input(),
          executor: 'codex',
          execution: { approvalPolicy: 'never' },
        })
      ).status,
    ).toBe(400);
    expect(
      (await call('/api/jobs', { ...input(), executor: 'codex', projectId: b.id })).status,
    ).toBe(400);
  } finally {
    queue.stop();
    rmSync(directory, { recursive: true, force: true });
  }
});
