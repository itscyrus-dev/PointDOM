import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/bridge/store.js';
import { Queue } from '../src/bridge/queue.js';
import { waitForTask } from '../src/bridge/task-wait.js';

test('listening wakes only for assigned work, never claims, and clears on timeout, cancellation and disconnect', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pointdom-wait-'));
  try {
    const store = new Store(directory),
      queue = new Queue(store);
    const projectId = randomUUID(),
      claim = randomUUID(),
      otherClaim = randomUUID();
    store.config.projects.push({
      id: projectId,
      name: 'Fixture',
      cwd: directory,
      origins: ['http://localhost:3000'],
    });
    const client = queue.agents.register({
      projectId,
      claim,
      client: { name: 'Trae', version: 'test' },
    });
    const other = queue.agents.register({
      projectId,
      claim: otherClaim,
      client: { name: 'Codex', version: 'test' },
    });
    const input = {
      id: randomUUID(),
      projectId,
      recipientId: other.id,
      instruction: 'Adjust title',
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
    queue.submit(input);
    const controller = new AbortController();
    const wait = (ms = 1000) =>
      waitForTask(store, queue.agents, projectId, claim, ms, controller.signal);
    const pending = wait();
    assert.equal(queue.agents.get(client.id, projectId)?.listening, true);
    await assert.rejects(wait(), /MCP_WAIT_ALREADY_ACTIVE/);
    const task = queue.submit({ ...input, id: randomUUID(), recipientId: client.id });
    assert.equal((await pending).taskId, task.id);
    assert.equal(task.status, 'queued');
    // A different running recipient in this project prevents concurrent editing.
    const otherTask = store.jobs.find((job) => job.id === input.id)!;
    otherTask.status = 'running';
    assert.equal((await wait(20)).timedOut, true);
    otherTask.status = 'queued';

    assert.equal(queue.agents.get(client.id, projectId)?.listening, false);
    queue.cancel(task.id);
    assert.equal((await wait(20)).timedOut, true);
    const cancelled = wait();
    controller.abort();
    await assert.rejects(cancelled, { name: 'AbortError' });
    assert.equal(queue.agents.get(client.id, projectId)?.listening, false);
    const disconnected = waitForTask(
      store,
      queue.agents,
      projectId,
      claim,
      1000,
      new AbortController().signal,
    );
    queue.agents.disconnect(projectId, claim);
    await assert.rejects(disconnected, /MCP_SESSION_CLOSED/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
