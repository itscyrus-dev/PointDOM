import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PanelController } from '../src/extension/panel-controller.js';

type Listener = (message: unknown, sender: chrome.runtime.MessageSender) => void;
async function fixture() {
  const originals = new Map(
    ['chrome', 'window', 'document', 'fetch'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const listeners = new Set<Listener>();
  const event = { addListener() {}, removeListener() {} };
  const origin = 'http://localhost:5173';
  let active = false;
  const sender = {
    id: 'fixture-extension',
    tab: {
      id: 7,
      index: 0,
      pinned: false,
      highlighted: true,
      windowId: 1,
      active: true,
      frozen: false,
      incognito: false,
      selected: true,
      discarded: false,
      autoDiscardable: true,
      groupId: -1,
      lastAccessed: 0,
    },
    frameId: 0,
    url: `${origin}/studio`,
  };
  const emit = (value: unknown, from: chrome.runtime.MessageSender = sender) => {
    for (const listener of listeners) listener(value, from);
  };
  Object.assign(globalThis, {
    chrome: {
      runtime: {
        id: sender.id,
        sendMessage: async () => ({ ok: true }),
        onMessage: {
          addListener: (listener: Listener) => listeners.add(listener),
          removeListener: (listener: Listener) => listeners.delete(listener),
        },
      },
      storage: {
        local: { get: async () => ({ bridgeToken: 'fixture-token' }), set: async () => {} },
        onChanged: event,
      },
      tabs: {
        query: async () => [{ id: 7, url: sender.url }],
        sendMessage: async (_id: number, { type }: { type: string }) => {
          if (type === 'POINTDOM_GET_PICKER_STATE') return { active };
          if (type === 'PAGEPATCH_STOP_PICKER') {
            active = false;
            emit({ type: 'POINTDOM_PICKER_STATE', active });
          }
          return { ok: true };
        },
        onActivated: event,
        onUpdated: event,
      },
      scripting: {
        executeScript: async () => {
          active = !active;
          emit({ type: 'POINTDOM_PICKER_STATE', active });
        },
      },
      commands: { getAll: async () => [] },
    },
    window: { addEventListener() {}, removeEventListener() {} },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    fetch: async (input: string) =>
      Response.json(
        input.endsWith('/api/pair')
          ? { defaultExecutor: 'mcp' }
          : input.endsWith('/api/projects')
            ? {
                projects: [
                  {
                    id: 'a8d86399-42aa-4203-8456-61dab92ffde1',
                    name: 'Fixture',
                    cwd: '/fixture',
                    origins: [origin],
                  },
                ],
              }
            : { jobs: [] },
      ),
  });
  const controller = new PanelController();
  await controller.start();
  return {
    controller,
    sender,
    emit,
    setActive(value: boolean) {
      active = value;
    },
    dispose() {
      controller.stop();
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

test('picker state follows actual toggles, external stop and side-panel reopening', async () => {
  const f = await fixture();
  try {
    assert.equal(f.controller.snapshot().pickerActive, false);
    await f.controller.pick();
    assert.equal(f.controller.snapshot().pickerActive, true);
    f.controller.stop();
    await f.controller.start();
    assert.equal(f.controller.snapshot().pickerActive, true);
    await f.controller.pick();
    assert.equal(f.controller.snapshot().pickerActive, false);
    f.setActive(true);
    f.emit({ type: 'POINTDOM_PICKER_STATE', active: true });
    assert.equal(f.controller.snapshot().pickerActive, true);
    await f.controller.stopPicker();
    assert.equal(f.controller.snapshot().pickerActive, false);
  } finally {
    f.dispose();
  }
});

test('inactive tabs, foreign contexts, child frames and malformed messages cannot change picker state', async () => {
  const f = await fixture();
  try {
    for (const sender of [
      { ...f.sender, id: 'another-extension' },
      { ...f.sender, tab: { ...f.sender.tab, id: 8 } },
      { ...f.sender, frameId: 2 },
      { ...f.sender, url: 'https://unrelated.example/studio' },
      { ...f.sender, url: 'http://localhost:5173/previous-page' },
    ]) {
      f.emit({ type: 'POINTDOM_PICKER_STATE', active: true }, sender);
      assert.equal(f.controller.snapshot().pickerActive, false);
    }
    f.emit({ type: 'POINTDOM_PICKER_STATE', active: 'true' });
    assert.equal(f.controller.snapshot().pickerActive, false);
    f.emit({ type: 'POINTDOM_PICKER_STATE', active: true });
    assert.equal(f.controller.snapshot().pickerActive, true);
    f.emit({ type: 'POINTDOM_PICKER_STATE', active: false });
    assert.equal(f.controller.snapshot().pickerActive, false);
  } finally {
    f.dispose();
  }
});
