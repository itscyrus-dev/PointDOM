import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { connectionConfig, connectionLink } from '../src/bridge/connection.js';

test('CC Switch import links isolate projects and installations, target one app and exclude secrets', () => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'pointdom-connect-')));
  try {
    const project = join(directory, '项目 with spaces');
    const other = join(directory, 'other');
    mkdirSync(project);
    mkdirSync(other);
    const entry = join(directory, 'mcp.js');
    const nextEntry = join(directory, 'next.js');
    writeFileSync(entry, '');
    writeFileSync(nextEntry, '');
    const state = { token: 'never-export-this', projects: [{ cwd: project }, { cwd: other }] };
    const config = connectionConfig(state, project, directory, entry);
    const id = Object.keys(config.mcpServers)[0]!;
    assert.deepEqual(config.mcpServers[id], {
      command: process.execPath,
      args: [entry, '--project', project],
      env: { PAGEPATCH_HOME: directory },
    });
    assert.deepEqual(connectionConfig(state, project, directory, entry), config);
    assert.notEqual(
      Object.keys(connectionConfig(state, other, directory, entry).mcpServers)[0],
      id,
    );
    assert.notEqual(
      Object.keys(connectionConfig(state, project, directory, nextEntry).mcpServers)[0],
      id,
    );
    for (const app of ['opencode', 'codex', 'claude']) {
      const url = new URL(connectionLink(config, app));
      assert.equal(url.protocol, 'ccswitch:');
      assert.equal(url.host, 'v1');
      assert.equal(url.pathname, '/import');
      assert.equal(url.searchParams.get('resource'), 'mcp');
      assert.equal(url.searchParams.get('apps'), app);
      const decoded = Buffer.from(url.searchParams.get('config')!, 'base64').toString('utf8');
      assert.deepEqual(JSON.parse(decoded), config);
      assert.equal(decoded.includes(state.token), false);
    }
    assert.throws(() => connectionConfig(state, directory, directory, entry), /Project not linked/);
    assert.throws(
      () => connectionConfig(state, project, directory, join(directory, 'missing')),
      /MCP entry not found/,
    );
    assert.throws(() => connectionLink(config, 'unknown'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
