import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPreferences, readPreferences } from '../src/extension/ui-preferences.js';

test('appearance preferences survive partial upgrades and discard malformed persisted values', () => {
  for (const value of [undefined, null, [], 4, 'dark'])
    assert.deepEqual(readPreferences(value), defaultPreferences);
  assert.deepEqual(readPreferences({ language: 'en', mode: 'light' }), {
    ...defaultPreferences,
    language: 'en',
    mode: 'light',
  });
  assert.deepEqual(
    readPreferences({
      language: 'en',
      mode: 'bad',
      accent: '<script>',
      shape: null,
      version: 99,
      token: 'never-forward',
    }),
    { ...defaultPreferences, language: 'en' },
  );
});

test('retired shape preferences normalize to rounded without losing other preferences', () => {
  for (const shape of ['compact', 'soft', 'rounded']) {
    assert.deepEqual(readPreferences({ shape, accent: 'rose', language: 'en' }), {
      ...defaultPreferences,
      shape: 'rounded',
      accent: 'lime',
      language: 'en',
    });
  }
});

test('retired color preferences migrate to fixed lime without changing language or mode', () => {
  for (const accent of ['rose', 'sky', 'violet', 'mint', 'orange', 'coral', 'yellow']) {
    assert.deepEqual(readPreferences({ accent, mode: 'system', language: 'en' }), {
      ...defaultPreferences,
      accent: 'lime',
      mode: 'system',
      language: 'en',
    });
  }
});
