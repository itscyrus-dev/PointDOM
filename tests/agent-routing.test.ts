import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/bridge/store.js';
import { Queue } from '../src/bridge/queue.js';
import { createApp } from '../src/bridge/server.js';
import { AgentConnections } from '../src/bridge/agent-connections.js';

test('an old unregistered MCP process cannot report a successful empty inbox as a live connection', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pointdom-stale-client-'));
  try {
    const store = new Store(directory),
      projectId = randomUUID();
    store.config.projects.push({
      id: projectId,
      name: 'Fixture',
      cwd: directory,
      origins: ['http://localhost:3000'],
    });
    const app = createApp(store, new Queue(store));
    for (const session of ['', randomUUID()]) {
      const response = await app.request(
        `http://127.0.0.1:4318/api/mcp/tasks?projectId=${projectId}`,
        {
          headers: {
            Host: '127.0.0.1:4318',
            Authorization: `Bearer ${store.config.token}`,
            'X-PagePatch-MCP': '1',
            ...(session ? { 'X-PointDOM-Session': session } : {}),
          },
        },
      );
      assert.equal(response.status, 409);
      const result = await response.json();
      assert.equal(result.code, 'MCP_RECONNECT_REQUIRED');
      assert.match(result.error, /reconnect/i);
      assert.equal(result.tasks, undefined);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('presence expires, same-name sessions remain distinct, and public IDs cannot impersonate a session', () => {
  let now = Date.now();
  const agents = new AgentConnections(() => now);
  const projectId = randomUUID(),
    claim = randomUUID();
  const input = { projectId, claim, client: { name: 'Codex', version: 'fixture' } };
  const first = agents.register(input);
  const second = agents.register({ ...input, claim: randomUUID() });
  assert.notEqual(first.id, second.id);
  assert.equal(agents.session(projectId, first.id), undefined);
  assert.equal(agents.get(first.id, randomUUID()), undefined);
  now += 30_000;
  assert.equal(agents.register(input).id, first.id);
  now += 20_000;
  assert.deepEqual(
    agents.list(projectId).map((agent) => agent.id),
    [first.id],
  );
  now += 46_000;
  assert.equal(agents.list(projectId).length, 0);
  assert.equal(agents.session(projectId, claim), undefined);
  // A still-live stdio process keeps its identity when the bridge reconnects.
  assert.equal(agents.register(input).id, first.id);
  agents.disconnect(projectId, randomUUID());
  assert.equal(agents.list(projectId).length, 1);
  agents.disconnect(projectId, claim);
  assert.equal(agents.list(projectId).length, 0);
});

test('only the selected MCP connection can see and claim a task; queued reassignment is explicit', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pointdom-routing-'));
  try {
    const store = new Store(directory);
    const projectId = randomUUID(),
      otherProjectId = randomUUID();
    for (const id of [projectId, otherProjectId])
      store.config.projects.push({
        id,
        name: 'Fixture',
        cwd: directory,
        origins: ['http://localhost:3000'],
      });
    const extension = `chrome-extension://${'a'.repeat(32)}`;
    store.config.clients.push(extension);
    const queue = new Queue(store),
      app = createApp(store, queue);
    const call = (path: string, body?: unknown, claim?: string, browser = false) =>
      app.request(`http://127.0.0.1:4318/api/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Host: '127.0.0.1:4318',
          Authorization: `Bearer ${store.config.token}`,
          'Content-Type': 'application/json',
          ...(browser
            ? { Origin: extension }
            : { 'X-PagePatch-MCP': '1', ...(claim ? { 'X-PointDOM-Session': claim } : {}) }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const register = async (name: string, project = projectId) => {
      const claim = randomUUID();
      const response = await call('mcp/connections', {
        projectId: project,
        claim,
        client: { name, version: '1.0' },
      });
      assert.equal(response.status, 200);
      return {
        claim,
        connection: (await response.json()).connection as { id: string; name: string },
      };
    };
    const codex = await register('Codex'),
      trae = await register('Trae'),
      foreign = await register('Trae', otherProjectId);
    const connections = await (
      await call(`agents?projectId=${projectId}`, undefined, undefined, true)
    ).json();
    assert.deepEqual(
      connections.agents.map((a: { name: string }) => a.name),
      ['Codex', 'Trae'],
    );
    assert.ok(!JSON.stringify(connections).includes(codex.claim));
    const input = {
      id: randomUUID(),
      projectId,
      instruction: 'Adjust heading',
      recipientId: codex.connection.id,
      selection: {
        url: 'http://localhost:3000/',
        title: 'Fixture',
        selector: 'h1',
        label: 'Title',
        tag: 'h1',
        viewport: { width: 800, height: 600 },
        rect: { x: 0, y: 0, width: 100, height: 20 },
        styles: {},
      },
    };
    assert.equal(
      (await call('jobs', { ...input, recipientId: foreign.connection.id }, undefined, true))
        .status,
      409,
    );
    assert.equal(
      (await call('jobs', { ...input, recipientId: undefined }, undefined, true)).status,
      409,
    );
    assert.equal((await call('jobs', input, undefined, true)).status, 202);
    assert.equal((await call('jobs', input, undefined, true)).status, 202);
    assert.equal(store.jobs.length, 1);
    const list = async (claim: string) =>
      (await (await call(`mcp/tasks?projectId=${projectId}`, undefined, claim)).json()).tasks;
    assert.equal((await list(codex.claim)).length, 1);
    assert.equal((await list(trae.claim)).length, 0);
    assert.equal(
      (await call(`mcp/tasks/${input.id}?projectId=${projectId}`, undefined, trae.claim)).status,
      404,
    );
    assert.equal(
      (await call(`mcp/tasks/${input.id}/claim`, { projectId, claim: trae.claim, agent: 'Codex' }))
        .status,
      403,
    );
    assert.equal(
      (
        await call(`mcp/tasks/${input.id}/claim`, {
          projectId,
          claim: randomUUID(),
          agent: 'Codex',
        })
      ).status,
      403,
    );
    const reassign = (recipientId: string, expectedRecipientId: string | null) =>
      call(`jobs/${input.id}/recipient`, { recipientId, expectedRecipientId }, undefined, true);
    assert.equal((await reassign(trae.connection.id, codex.connection.id)).status, 200);
    assert.equal((await reassign(codex.connection.id, codex.connection.id)).status, 409);
    assert.equal((await list(codex.claim)).length, 0);
    assert.equal((await list(trae.claim)).length, 1);
    assert.equal(
      (await call(`mcp/tasks/${input.id}/claim`, { projectId, claim: codex.claim, agent: 'Trae' }))
        .status,
      403,
    );
    assert.equal(
      (
        await call(`mcp/tasks/${input.id}/claim`, {
          projectId,
          claim: trae.claim,
          agent: 'spoofed label',
        })
      ).status,
      200,
    );
    assert.equal(store.jobs[0]!.agent, 'Trae');
    assert.equal((await reassign(codex.connection.id, trae.connection.id)).status, 409);
    const next = queue.submit({ ...input, id: randomUUID() });
    assert.equal(
      (await call(`mcp/tasks/${next.id}/claim`, { projectId, claim: codex.claim, agent: 'Codex' }))
        .status,
      409,
    );
    queue.cancel(next.id);
    // Losing presence never transfers ownership or prevents the original session reporting.
    queue.agents.disconnect(projectId, trae.claim);
    assert.equal(
      (
        await call(`mcp/tasks/${input.id}/report`, {
          projectId,
          claim: codex.claim,
          outcome: 'completed',
          summary: 'False',
          files: [],
          verification: 'None',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await call(`mcp/tasks/${input.id}/report`, {
          projectId,
          claim: trae.claim,
          outcome: 'completed',
          summary: 'Verified',
          files: [],
          verification: 'Fixture only',
        })
      ).status,
      200,
    );
    assert.equal(new Store(directory).jobs[0]!.recipient?.id, trae.connection.id);
    // A retry of the original submission must not undo an explicit reassignment.
    assert.equal((await call('jobs', input, undefined, true)).status, 202);
    assert.equal(store.jobs[0]!.recipient?.id, trae.connection.id);
    queue.agents.register({
      projectId,
      claim: trae.claim,
      client: { name: 'Trae', version: '1.0' },
    });
    // Old records remain readable in the panel, but are never a shared executable inbox.
    const legacy = queue.submit({ ...input, id: randomUUID(), recipientId: undefined });
    assert.equal(
      (await list(trae.claim)).some((job: { id: string }) => job.id === legacy.id),
      false,
    );
    assert.equal(
      (await call(`mcp/tasks/${legacy.id}/claim`, { projectId, claim: trae.claim, agent: 'Trae' }))
        .status,
      409,
    );
    queue.cancel(legacy.id);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
