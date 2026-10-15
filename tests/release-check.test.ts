import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkLatestRelease,
  compareVersions,
  latestReleaseUrl,
} from '../src/extension/release-check.js';
test('release comparison is numeric, supports Chrome version components and rejects malformed versions', () => {
  assert.equal(compareVersions('0.2.10', '0.2.9'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0.0'), 0);
  assert.equal(compareVersions('1.0.0', '1.0.0.1'), -1);
  assert.throws(() => compareVersions('broken', '1.0.0'));
});
test('release checks read only public metadata and distinguish current, available and ahead builds', async () => {
  let latest = 'v0.2.1';
  const network = mock.method(
    globalThis,
    'fetch',
    async (input: string | URL | Request, init?: RequestInit) => {
      assert.equal(input, latestReleaseUrl);
      assert.equal(init?.credentials, 'omit');
      assert.equal(new Headers(init?.headers).has('Authorization'), false);
      assert.equal(init?.body, undefined);
      assert.ok(init?.signal);
      return Response.json({ tag_name: latest, draft: false, prerelease: false });
    },
  );
  try {
    assert.deepEqual(await checkLatestRelease('0.2.1'), { latest: '0.2.1', status: 'current' });
    latest = 'v0.2.10';
    assert.equal((await checkLatestRelease('0.2.9')).status, 'available');
    latest = 'v0.1.0';
    assert.equal((await checkLatestRelease('0.2.1')).status, 'ahead');
  } finally {
    network.mock.restore();
  }
});
test('failed requests, drafts, prereleases and malformed metadata cannot report up to date', async () => {
  let result: unknown = {};
  let status = 200;
  const network = mock.method(globalThis, 'fetch', async () => Response.json(result, { status }));
  try {
    for (const body of [
      {},
      { tag_name: 'main', draft: false, prerelease: false },
      { tag_name: 'v0.2.1', draft: true, prerelease: false },
      { tag_name: 'v0.2.1', draft: false, prerelease: true },
    ]) {
      result = body;
      await assert.rejects(checkLatestRelease('0.2.1'));
    }
    result = { tag_name: 'v0.2.1', draft: false, prerelease: false };
    status = 403;
    await assert.rejects(checkLatestRelease('0.2.1'));
    network.mock.mockImplementation(async () => {
      throw new Error('offline');
    });
    await assert.rejects(checkLatestRelease('0.2.1'));
  } finally {
    network.mock.restore();
  }
});
