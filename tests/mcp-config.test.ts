import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('MCP config selects one registered project and exports CC Switch and OpenCode without credentials', () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'pagepatch-mcp-config-')));
  try {
    const script = join(home, 'scripts/mcp-config.mjs');
    const entry = join(home, 'dist/bridge/mcp.js');
    mkdirSync(join(home, 'scripts'));
    mkdirSync(join(home, 'dist/bridge'), { recursive: true });
    writeFileSync(script, readFileSync('scripts/mcp-config.mjs'));
    writeFileSync(entry, '');
    const project = join(home, 'project');
    mkdirSync(project);
    const config = {
      token: 'fixture-secret-not-for-export',
      projects: [{ cwd: project }],
    };
    const save = () => writeFileSync(join(home, 'config.json'), JSON.stringify(config));
    save();
    const run = (args: string[]) =>
      execFileSync(process.execPath, [script, ...args], {
        env: { ...process.env, PAGEPATCH_HOME: home },
        encoding: 'utf8',
      });
    const raw = run([]);
    assert.equal(raw.includes(config.token), false);
    const server = JSON.parse(raw).mcpServers.pagepatch;
    assert.equal(server.command, process.execPath);
    assert.deepEqual(server.args, [entry, '--project', project]);
    assert.equal(server.env.PAGEPATCH_HOME, home);
    const native = JSON.parse(run(['--client', 'opencode'])).mcp.pagepatch;
    assert.equal(native.type, 'local');
    assert.equal(native.enabled, true);
    assert.deepEqual(native.command, [server.command, ...server.args]);
    assert.deepEqual(native.environment, server.env);
    const failure = (args: string[], message: string) => {
      const result = spawnSync(process.execPath, [script, ...args], {
        env: { ...process.env, PAGEPATCH_HOME: home },
        encoding: 'utf8',
      });
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout, '');
      assert.ok(result.stderr.includes(message));
    };
    failure(['--project'], '缺少参数');
    failure(['--client', 'unknown'], '仅支持');
    failure(['--project', home], '项目尚未注册');
    config.projects.push({ cwd: home });
    save();
    failure([], '--project');
    assert.equal(JSON.parse(run(['--project', project])).mcpServers.pagepatch.args[2], project);
    rmSync(entry);
    failure(['--project', project], 'pnpm build');
    config.projects = [];
    save();
    failure([], '--project');
    assert.equal(JSON.parse(readFileSync(join(home, 'config.json'), 'utf8')).token, config.token);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
