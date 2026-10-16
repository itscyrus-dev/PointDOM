import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { connectionConfig, connectionLink } from '../src/bridge/connection.js';

test('MCP export is project independent, targets one app and excludes secrets', () => {
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
    const config = connectionConfig(directory, entry);
    const id = Object.keys(config.mcpServers)[0]!;
    assert.deepEqual(config.mcpServers[id], {
      command: process.execPath,
      args: [entry],
      env: { PAGEPATCH_HOME: directory },
    });
    assert.deepEqual(connectionConfig(directory, entry), config);
    assert.equal(Object.keys(connectionConfig(directory, entry).mcpServers)[0], id);
    assert.equal(Object.keys(connectionConfig(directory, nextEntry).mcpServers)[0], id);
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
    assert.equal(id, 'pointdom');
    assert.deepEqual(connectionConfig(directory, entry), config);
    assert.throws(
      () => connectionConfig(directory, join(directory, 'missing')),
      /MCP entry not found/,
    );
    assert.throws(() => connectionLink(config, 'unknown'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
