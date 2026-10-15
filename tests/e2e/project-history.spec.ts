import { extensionBrowserArgs } from './browser-args.js';
import { test, expect, chromium } from '@playwright/test';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../../src/bridge/store.js';
import { Queue } from '../../src/bridge/queue.js';
import { createApp } from '../../src/bridge/server.js';
import { fixtureDelivery } from '../delivery-fixture.js';
import type { Job } from '../../src/shared/contracts.js';

test('history and counts follow the selected project across tabs, shared origins and reopening', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'pointdom-history-ui-'));
  const extension = join(directory, 'extension');
  cpSync(resolve('dist/extension'), extension, { recursive: true });
  const store = new Store(join(directory, 'state'));
  const app = new Hono();
  app.get('/fixture', (c) =>
    c.html('<!doctype html><title>History fixture</title><h1>Fixture</h1>'),
  );
  const server = serve({ hostname: '127.0.0.1', port: 0, fetch: app.fetch });
  if (!server.listening) await new Promise<void>((done) => server.once('listening', done));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture port');
  const originA = `http://127.0.0.1:${address.port}`;
  const originB = `http://localhost:${address.port}`;
  const a = {
    id: randomUUID(),
    name: 'Project Alpha',
    cwd: join(directory, 'alpha'),
    origins: [originA],
  };
  const b = {
    id: randomUUID(),
    name: 'Project Beta',
    cwd: join(directory, 'beta'),
    origins: [originB],
  };
  mkdirSync(a.cwd);
  mkdirSync(b.cwd);
  store.config.projects.push(a, b);
  const makeJob = (
    projectId: string,
    origin: string,
    instruction: string,
    status: Job['status'],
  ): Job => {
    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      projectId,
      instruction,
      status,
      executor: 'mcp',
      createdAt: now,
      updatedAt: now,
      result: 'Fixture result',
      events: [],
      selection: {
        url: `${origin}/fixture`,
        title: 'Fixture',
        label: 'Fixture element',
        selector: 'h1',
        tag: 'h1',
        viewport: { width: 1000, height: 800 },
        rect: { x: 0, y: 0, width: 100, height: 30 },
        styles: {},
      },
    };
  };
  store.jobs.push(
    makeJob(a.id, originA, 'Alpha completed request', 'completed'),
    makeJob(a.id, originA, 'Alpha running request', 'running'),
    makeJob(b.id, originB, 'Beta completed request', 'completed'),
  );
  store.saveJobs();
  app.route('/', createApp(store, new Queue(store), address.port, fixtureDelivery));
  for (const name of ['manifest.json', 'panel.js', 'background.js']) {
    const path = join(extension, name);
    writeFileSync(path, readFileSync(path, 'utf8').replaceAll('http://127.0.0.1:4318', originA));
  }
  const manifestPath = join(extension, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.host_permissions.push(`${originB}/*`);
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext(join(directory, 'profile'), {
    channel: 'chromium',
    headless: true,
    args: extensionBrowserArgs(extension),
  });
  try {
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const page = await context.newPage();
    await page.goto(`${originA}/fixture`);
    const panel = await context.newPage();
    panel.setDefaultTimeout(5000);
    await panel.setViewportSize({ width: 390, height: 850 });
    await panel.goto(`chrome-extension://${new URL(worker.url()).host}/panel.html`);
    await panel.locator('#token').fill(store.config.token);
    await panel.locator('#connect').click();
    await page.bringToFront();
    await expect(panel.locator('#project-path')).toHaveText(a.name);
    await expect(panel.locator('#job-count')).toHaveText('2');
    await expect(panel.locator('#active-count')).toHaveText('1');
    await expect(panel.locator('#jobs')).toContainText('Alpha completed request');
    await expect(panel.locator('#jobs')).not.toContainText('Beta completed request');
    await panel.locator('#tab-active').click();
    await expect(panel.locator('#jobs .job')).toHaveCount(1);
    await expect(panel.locator('#jobs')).toContainText('Alpha running request');
    await page.goto(`${originB}/fixture`);
    await page.bringToFront();
    await expect(panel.locator('#project-path')).toHaveText(b.name);
    await expect(panel.locator('#active-count')).toHaveText('0');
    await expect(panel.locator('#job-count')).toHaveText('1');
    await expect(panel.locator('#jobs .job')).toHaveCount(0);
    await panel.locator('#tab-all').click();
    await expect(panel.locator('#jobs')).toContainText('Beta completed request');
    await expect(panel.locator('#jobs')).not.toContainText('Alpha');
    await panel.screenshot({ path: test.info().outputPath('pointdom-project-beta-history.png') });
    await panel.reload();
    await page.bringToFront();
    await expect(panel.locator('#project-path')).toHaveText(b.name);
    await expect(panel.locator('#job-count')).toHaveText('1');
    await expect(panel.locator('#jobs')).not.toContainText('Alpha');
    await page.goto(`${originA}/fixture`);
    await page.bringToFront();
    await expect(panel.locator('#project-path')).toHaveText(a.name);
    await expect(panel.locator('#job-count')).toHaveText('2');
    await expect(panel.locator('#jobs')).not.toContainText('Beta');
    const empty = {
      id: randomUUID(),
      name: 'Empty project',
      cwd: join(directory, 'empty'),
      origins: [originA],
    };
    mkdirSync(empty.cwd);
    store.config.projects.push(empty);
    await panel.locator('#refresh').click();
    // Two projects share this origin; until explicitly selected, neither history is visible.
    await expect(panel.locator('#project-field')).toBeVisible();
    await expect(panel.locator('#jobs .job')).toHaveCount(0);
    await expect(panel.locator('#job-count')).toHaveText('0');
    await panel.locator('#project').click();
    await panel.getByRole('option', { name: empty.name, exact: true }).click();
    await panel.locator('#close-connection').click();
    await expect(panel.locator('#project-path')).toHaveText(empty.name);
    await expect(panel.locator('#job-count')).toHaveText('0');
    await expect(panel.locator('#active-count')).toHaveText('0');
    await expect(panel.locator('#jobs .job')).toHaveCount(0);
    await panel.locator('#connection-settings').click();
    await panel.locator('#project').click();
    await panel.getByRole('option', { name: a.name, exact: true }).click();
    await panel.locator('#close-connection').click();
    await expect(panel.locator('#job-count')).toHaveText('2');
    await expect(panel.locator('#jobs')).toContainText('Alpha completed request');
    expect(new Store(join(directory, 'state')).jobs).toHaveLength(3);
  } finally {
    await context.close();
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
    rmSync(directory, { recursive: true, force: true });
  }
});
