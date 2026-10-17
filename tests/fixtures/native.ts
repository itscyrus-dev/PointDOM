/** Temporary native service + fixture website. Never reads or mutates installed PointDOM state. */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  mkdtempSync,
  realpathSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  cpSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Job, Project } from '../../src/shared/contracts.js';
import { extensionBrowserArgs } from '../e2e/browser-args.js';
export async function nativeFixture(html: string) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'pointdom-native-browser-')));
  const state = join(directory, 'state');
  mkdirSync(state);
  const token = randomBytes(32).toString('hex');
  let serviceBase = '';
  const website = createServer(async (req, res) => {
    if (req.url?.startsWith('/api/')) {
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers)) {
          if (!['host', 'content-length', 'connection'].includes(name) && typeof value === 'string')
            headers.set(name, value);
        }
        const response = await fetch(serviceBase + req.url, {
          method: req.method,
          headers,
          ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
          signal: AbortSignal.timeout(30000),
        });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch {
        res.writeHead(503);
        res.end('{}');
      }
    } else {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
    }
  });
  await new Promise<void>((done) => website.listen(0, '127.0.0.1', done));
  const address = website.address();
  if (!address || typeof address === 'string') throw Error('No fixture port');
  const origin = `http://127.0.0.1:${address.port}`;
  const reservation = createServer();
  await new Promise<void>((done) => reservation.listen(0, '127.0.0.1', done));
  const local = reservation.address();
  if (!local || typeof local === 'string') throw Error('No service port');
  await new Promise<void>((done) => reservation.close(() => done()));
  serviceBase = `http://127.0.0.1:${local.port}`;
  const project: Project = { id: randomUUID(), name: 'Fixture', cwd: directory, origins: [origin] };
  writeFileSync(
    join(state, 'config.json'),
    JSON.stringify({
      version: 1,
      token,
      clients: [],
      projects: [project],
      threads: {},
      defaultExecutor: 'mcp',
    }),
  );
  const env = { ...process.env, PAGEPATCH_HOME: state, POINTDOM_PORT: String(local.port) };
  const binary = resolve(`target/debug/pointdom${process.platform === 'win32' ? '.exe' : ''}`);
  const service = spawn(binary, ['serve'], { env, stdio: 'ignore' });
  const localApi = async (path: string, body?: unknown) => {
    const response = await fetch(serviceBase + '/api/local' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-PagePatch-Local': '1',
        'Content-Type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw Error(`Native fixture HTTP ${response.status}`);
    return response.json() as Promise<unknown>;
  };
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      await localApi('/status');
      ready = true;
      break;
    } catch {
      await new Promise((done) => setTimeout(done, 30));
    }
  }
  if (!ready) {
    service.kill();
    website.close();
    throw Error('Native fixture did not start');
  }
  const client = new Client({ name: 'Selection fixture', version: '1' });
  await client.connect(
    new StdioClientTransport({
      command: binary,
      args: ['mcp'],
      env: env as Record<string, string>,
    }),
  );
  await client.callTool({ name: 'pointdom_bind_project', arguments: { path: directory } });
  const extension = join(directory, 'extension');
  cpSync(resolve('dist/extension'), extension, { recursive: true });
  for (const name of ['manifest.json', 'panel.js', 'background.js']) {
    const file = join(extension, name);
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll('http://127.0.0.1:4318', origin));
  }
  const context = await chromium.launchPersistentContext(join(directory, 'profile'), {
    channel: 'chromium',
    headless: true,
    args: extensionBrowserArgs(extension),
  });
  return {
    directory,
    state,
    origin,
    token,
    project,
    context,
    client,
    local: localApi,
    jobs: () => JSON.parse(readFileSync(join(state, 'jobs.json'), 'utf8')) as Job[],
    wait: () => {
      const waiting = client.callTool({
        name: 'pointdom_wait_for_task',
        arguments: { projectId: project.id, timeoutSeconds: 25 },
      });
      void waiting.catch(() => {});
      return waiting;
    },
    close: async () => {
      await context.close();
      service.kill('SIGTERM');
      await client.close();
      await new Promise<void>((done) =>
        service.exitCode !== null || service.signalCode !== null
          ? done()
          : service.once('exit', () => done()),
      );
      await new Promise<void>((done) => website.close(() => done()));
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
