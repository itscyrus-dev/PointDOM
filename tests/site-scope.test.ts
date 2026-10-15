import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SiteScope } from '../src/extension/site-scope.js';

const origin = 'http://localhost:5173';
function fixture(paired = true) {
  const originals = new Map(
    ['chrome', 'fetch'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  const data: Record<string, unknown> = {
    bridgeToken: paired ? 'fixture-token' : '',
    pointdomLinkedOrigins: [origin],
  };
  let response: () => Promise<Response> = async () =>
    Response.json({ projects: [{ origins: [origin] }] });
  const options: { tabId: number; enabled: boolean }[] = [];
  const stopped: number[] = [];
  let calls = 0;
  Object.assign(globalThis, {
    chrome: {
      runtime: { id: 'fixture-extension' },
      storage: {
        local: {
          get: async () => ({ ...data }),
          set: async (value: Record<string, unknown>) => {
            Object.assign(data, value);
          },
        },
      },
      sidePanel: {
        setOptions: async (value: { tabId: number; enabled: boolean }) => {
          options.push(value);
        },
      },
      action: { setTitle: async () => {} },
      tabs: {
        query: async () => [
          { id: 1, url: origin },
          { id: 2, url: 'https://unrelated.example' },
          { id: 3 },
        ],
        sendMessage: async (tabId: number) => {
          stopped.push(tabId);
        },
      },
    },
    fetch: async () => {
      calls++;
      return response();
    },
  });
  return {
    scope: new SiteScope(),
    data,
    options,
    stopped,
    get calls() {
      return calls;
    },
    respond(value: typeof response) {
      response = value;
    },
    dispose() {
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

test('only exact linked origins enable panels; unrelated and hidden URLs stop picking', async () => {
  const f = fixture();
  try {
    await f.scope.load();
    assert.equal(f.scope.allows(`${origin}/editor`), true);
    for (const url of [
      undefined,
      'not a URL',
      'chrome://extensions',
      'https://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      `${origin}.evil.example`,
    ])
      assert.equal(f.scope.allows(url), false);
    await f.scope.syncAll();
    assert.deepEqual(
      f.options.map(({ tabId, enabled }) => ({ tabId, enabled })),
      [
        { tabId: 1, enabled: true },
        { tabId: 2, enabled: false },
        { tabId: 3, enabled: false },
      ],
    );
    assert.deepEqual(f.stopped, [2, 3]);
  } finally {
    f.dispose();
  }
});

test('unpaired browsers cannot enable panels from a stale cached allowlist', async () => {
  const f = fixture(false);
  try {
    await f.scope.load();
    await f.scope.refresh();
    assert.equal(f.scope.allows(origin), false);
    assert.equal(f.calls, 0);
  } finally {
    f.dispose();
  }
});

test('authenticated binding changes replace the allowlist and survive service-worker restart', async () => {
  const f = fixture();
  try {
    await f.scope.load();
    f.respond(async () => Response.json({ projects: [{ origins: ['http://localhost:3000'] }] }));
    await f.scope.refresh();
    assert.equal(f.scope.allows(origin), false);
    assert.equal(f.scope.allows('http://localhost:3000/work'), true);
    const restarted = new SiteScope();
    await restarted.load();
    assert.equal(restarted.allows('http://localhost:3000'), true);
    f.respond(async () => {
      throw new Error('offline');
    });
    await restarted.refresh();
    assert.equal(restarted.allows('http://localhost:3000'), true);
    f.respond(async () => Response.json({ error: 'denied' }, { status: 401 }));
    await restarted.refresh();
    assert.equal(restarted.allows('http://localhost:3000'), false);
    assert.deepEqual(f.data.pointdomLinkedOrigins, []);
  } finally {
    f.dispose();
  }
});

test('a response from a replaced pairing cannot restore its old project scope', async () => {
  const f = fixture();
  try {
    await f.scope.load();
    let finish!: (response: Response) => void;
    f.respond(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const stale = f.scope.refresh();
    f.data.bridgeToken = '';
    await f.scope.load();
    finish(Response.json({ projects: [{ origins: [origin] }] }));
    await stale;
    assert.equal(f.scope.allows(origin), false);
  } finally {
    f.dispose();
  }
});
