import { test, expect } from '@playwright/test';
import { CliRunner } from '../../src/bridge/cli-runner.js';
test('missing executables are disabled and detection is installation-scoped', async () => {
  let calls = 0;
  const runner = new CliRunner({
    resolve: async () => {
      calls++;
      return null;
    },
  });
  const [a, b] = await Promise.all([runner.list(), runner.list()]);
  expect(a).toEqual(b);
  expect(a).toHaveLength(4);
  expect(a.every((cli) => !cli.available)).toBe(true);
  expect(calls).toBe(4);
});
