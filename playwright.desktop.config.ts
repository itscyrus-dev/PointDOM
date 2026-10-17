import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/desktop',
  testMatch: 'native-ui.spec.ts',
  workers: 1,
  timeout: 60000,
  reporter: 'list',
  outputDir: 'test-results/desktop',
});
