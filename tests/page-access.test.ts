import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PanelController } from '../src/extension/panel-controller.js';

const origin = 'http://localhost:5173';
async function fixture(
  granted = true,
  changedTab = false,
  origins = [origin],
  grantedOrigin = origin,
) {
  let tab: { id: number; url?: string } = { id: 7 };
  const requested: string[][] = [];
  const injected: number[] = [];
  const activated: number[] = [];
  const allowed = new Set<string>();
  const permissionListeners = new Set<() => void>();
  const permissionEvent = {
    addListener: (listener: () => void) => permissionListeners.add(listener),
    removeListener: (listener: () => void) => permissionListeners.delete(listener),
  };
  const originals = new Map(
    ['chrome', 'window', 'document', 'fetch'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const event = { addListener() {}, removeListener() {} };
  Object.assign(globalThis, {
    chrome: {
      runtime: {
        id: 'fixture-extension',
        sendMessage: async () => ({ ok: true }),
        onMessage: event,
      },
      storage: {
        local: {
          get: async () => ({ bridgeToken: 'fixture-token' }),
          set: async () => {},
        },
        onChanged: event,
      },
      tabs: {
        query: async () => [tab],
        update: async (id: number) => {
          activated.push(id);
        },
        onActivated: event,
        onUpdated: event,
      },
      commands: { getAll: async () => [] },
      permissions: {
        contains: async ({ origins }: { origins: string[] }) =>
          origins.every((item) => allowed.has(item)),
        onAdded: permissionEvent,
        onRemoved: permissionEvent,
        request: async ({ origins }: { origins: string[] }) => {
          requested.push(origins);
          if (granted) {
            origins.forEach((item) => allowed.add(item));
            tab = { id: changedTab ? 8 : 7, url: `${grantedOrigin}/studio` };
          }
          return granted;
        },
      },
      scripting: {
        executeScript: async ({ target }: { target: { tabId: number } }) => {
          injected.push(target.tabId);
          return [];
        },
      },
    },
    window: { addEventListener() {}, removeEventListener() {} },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    fetch: async (input: string) =>
      Response.json(
        input.endsWith('/api/pair')
          ? { defaultExecutor: 'mcp' }
          : input.endsWith('/api/projects')
            ? {
                agentSettings: { defaultExecutor: 'codex' },
                projects: [
                  {
                    id: 'a8d86399-42aa-4203-8456-61dab92ffde1',
                    name: 'Fixture',
                    cwd: '/fixture',
                    origins,
                  },
                ],
              }
            : input.endsWith('/api/clis')
              ? { clis: [] }
              : { jobs: [] },
      ),
  });
  const controller = new PanelController();
  await controller.start();
  return {
    controller,
    requested,
    injected,
    activated,
    async changeAccess(value: boolean) {
      if (value) allowed.add(`${origin}/*`);
      else allowed.delete(`${origin}/*`);
      permissionListeners.forEach((listener) => listener());
      await new Promise<void>((done) => setImmediate(done));
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

test('first access can request the sole linked origin before Chrome exposes the tab URL', async () => {
  const f = await fixture();
  try {
    assert.equal(f.controller.snapshot().origin, '');
    assert.equal(f.controller.snapshot().projects.length, 1);
    assert.equal(f.controller.snapshot().siteAccess[origin], false);
    await f.controller.enablePage();
    assert.deepEqual(f.requested, [[`${origin}/*`]]);
    assert.deepEqual(f.injected, [7]);
    assert.equal(f.controller.snapshot().origin, origin);
    assert.equal(f.controller.snapshot().siteAccess[origin], true);
    assert.equal(f.controller.snapshot().enablingOrigin, '');
  } finally {
    f.dispose();
  }
});

test('denied access leaves the page untouched', async () => {
  const f = await fixture(false);
  try {
    await assert.rejects(f.controller.enablePage(), /请允许访问当前网页/);
    assert.deepEqual(f.requested, [[`${origin}/*`]]);
    assert.deepEqual(f.injected, []);
    assert.equal(f.controller.snapshot().siteAccess[origin], false);
    assert.equal(f.controller.snapshot().enablingOrigin, '');
  } finally {
    f.dispose();
  }
});

test('standalone settings grant only the chosen project and activate it without injecting into settings', async () => {
  const f = await fixture();
  try {
    await f.controller.enablePage(origin, true);
    assert.deepEqual(f.requested, [[`${origin}/*`]]);
    assert.deepEqual(f.activated, [7]);
    assert.deepEqual(f.injected, []);
    assert.match(f.controller.snapshot().notice?.zh || '', /项目网页访问已启用/);
  } finally {
    f.dispose();
  }
});

test('changing the active tab during permission confirmation cannot inject into either page', async () => {
  const f = await fixture(true, true);
  try {
    await assert.rejects(f.controller.enablePage(), /当前网页已变化/);
    assert.deepEqual(f.injected, []);
  } finally {
    f.dispose();
  }
});

test('multiple linked URLs require an explicit choice and never grant an unregistered origin', async () => {
  const f = await fixture(true, false, [origin, 'http://127.0.0.1:5173']);
  try {
    await assert.rejects(f.controller.enablePage(), /请选择已关联的项目网址/);
    await assert.rejects(
      f.controller.enablePage('https://unregistered.example'),
      /请选择已关联的项目网址/,
    );
    await assert.rejects(
      f.controller.openProjectSite('https://unregistered.example'),
      /请选择已关联的项目网址/,
    );
    assert.deepEqual(f.requested, []);
    await f.controller.enablePage(origin);
    assert.deepEqual(f.requested, [[`${origin}/*`]]);
    assert.deepEqual(f.injected, [7]);
  } finally {
    f.dispose();
  }
});

test('navigating the same tab to a different origin during permission confirmation cannot inject', async () => {
  const f = await fixture(true, false, [origin], 'http://localhost:3000');
  try {
    await assert.rejects(f.controller.enablePage(), /当前网页已变化/);
    assert.deepEqual(f.requested, [[`${origin}/*`]]);
    assert.deepEqual(f.injected, []);
  } finally {
    f.dispose();
  }
});

test('page access reflects permission changes without altering the linked project or requesting access', async () => {
  const f = await fixture();
  try {
    assert.equal(f.controller.snapshot().siteAccess[origin], false);
    await f.changeAccess(true);
    assert.equal(f.controller.snapshot().siteAccess[origin], true);
    await f.changeAccess(false);
    assert.equal(f.controller.snapshot().siteAccess[origin], false);
    assert.equal(f.controller.snapshot().projects.length, 1);
    assert.deepEqual(f.requested, []);
    assert.deepEqual(f.injected, []);
  } finally {
    f.dispose();
  }
});
