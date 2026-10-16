import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PanelController } from '../src/extension/panel-controller.js';

async function fixture(accept: () => Promise<{ ok: boolean }>) {
  const originals = new Map(
    ['chrome', 'window', 'document'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const selection = {
    url: 'http://localhost:5173/',
    title: 'Fixture',
    selector: '#send',
    label: 'Send',
    description: 'Preserve this element description if clearing fails',
    tag: 'button',
    viewport: { width: 1000, height: 800 },
    rect: { x: 0, y: 0, width: 80, height: 32 },
    styles: {},
  };
  const event = { addListener() {}, removeListener() {} };
  const operations: string[] = [];
  Object.assign(globalThis, {
    chrome: {
      runtime: {
        id: 'fixture-extension',
        onMessage: event,
        sendMessage: async ({ type }: { type: string }) => {
          if (type === 'POINTDOM_CLEAR_SELECTED') {
            operations.push(type);
            return accept();
          }
          return { ok: true };
        },
      },
      storage: {
        local: {
          set: async () => {},
          get: async () => ({ 'selection:7': [selection], 'draft:7': 'Keep overall requirements' }),
        },
        onChanged: event,
      },
      tabs: {
        query: async () => [{ id: 7, url: selection.url }],
        sendMessage: async (_id: number, { type }: { type: string }) => {
          if (type !== 'POINTDOM_GET_PICKER_STATE') operations.push(type);
        },
        onActivated: event,
        onUpdated: event,
      },
      commands: { getAll: async () => [] },
    },
    window: { addEventListener() {}, removeEventListener() {} },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
  });
  const controller = new PanelController();
  await controller.start();
  return {
    controller,
    operations,
    dispose() {
      controller.stop();
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

test('clear all stops picking before clearing and keeps overall instructions', async () => {
  const f = await fixture(async () => ({ ok: true }));
  try {
    assert.equal(f.controller.snapshot().selections.length, 1);
    await f.controller.clearSelected();
    assert.deepEqual(f.operations, ['PAGEPATCH_STOP_PICKER', 'POINTDOM_CLEAR_SELECTED']);
    assert.equal(f.controller.snapshot().selections.length, 0);
    assert.equal(f.controller.snapshot().draft, 'Keep overall requirements');
    await f.controller.clearSelected();
    assert.equal(f.operations.length, 2);
  } finally {
    f.dispose();
  }
});

test('clear failure preserves selected elements and descriptions for retry', async () => {
  const f = await fixture(async () => ({ ok: false }));
  try {
    const before = f.controller.snapshot().selections;
    await assert.rejects(f.controller.clearSelected(), /清空选取失败/);
    assert.deepEqual(f.controller.snapshot().selections, before);
    assert.equal(f.controller.snapshot().draft, 'Keep overall requirements');
  } finally {
    f.dispose();
  }
});
