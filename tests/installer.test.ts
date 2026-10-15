import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
test('curl installer works with spaced paths, is repeatable and rejects tampered or missing downloads', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pointdom-installer-'));
  try {
    const release = join(directory, 'release'),
      bin = join(directory, 'bin'),
      home = join(directory, 'home with spaces');
    const app = join(directory, 'package/pointdom');
    for (const path of [release, bin, home, `${app}/dist/bridge`, `${app}/dist/extension`])
      mkdirSync(path, { recursive: true });
    writeFileSync(
      `${bin}/uname`,
      '#!/bin/sh\ncase "$1" in -s) echo Darwin;; -m) echo arm64;; esac\n',
      { mode: 0o700 },
    );
    writeFileSync(`${bin}/opencode`, '#!/bin/sh\necho fixture\n', { mode: 0o700 });
    writeFileSync(
      `${bin}/node`,
      `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' "$@"\n`,
      { mode: 0o700 },
    );
    writeFileSync(`${app}/package.json`, '{"type":"module","version":"0.1.0"}');
    writeFileSync(`${app}/dist/extension/manifest.json`, '{"manifest_version":3}');
    writeFileSync(
      `${app}/dist/bridge/main.js`,
      `import {mkdirSync,writeFileSync} from 'node:fs'; import {join} from 'node:path';
      if(process.argv[2] === 'extension' && process.argv[3] === '--reload'){console.log('fixture: reload requested');process.exit(0);}
      if(process.argv[2] !== 'install' || process.env.FIXTURE_INSTALL_FAIL === '1')process.exit(1);
      const folder=join(process.env.HOME,'Library/LaunchAgents');mkdirSync(folder,{recursive:true});
      writeFileSync(join(folder,'dev.pointdom.bridge.plist'),'fixture');
      mkdirSync(join(process.env.HOME,'.local/bin'),{recursive:true});writeFileSync(join(process.env.HOME,'.local/bin/pointdom'),'fixture');`,
    );
    execFileSync('tar', [
      '-czf',
      `${release}/pointdom.tar.gz`,
      '-C',
      `${directory}/package`,
      'pointdom',
    ]);
    const hash = createHash('sha256')
      .update(readFileSync(`${release}/pointdom.tar.gz`))
      .digest('hex');
    writeFileSync(`${release}/SHA256SUMS`, `${hash}  pointdom.tar.gz\n`);
    const run = (
      shell = '/bin/zsh',
      extra: Record<string, string> = {},
      installerArgs: string[] = [],
    ) =>
      spawnSync('sh', [resolve('install.sh'), ...installerArgs], {
        env: {
          ...process.env,
          HOME: home,
          SHELL: shell,
          PATH: `${bin}:${process.env.PATH}`,
          POINTDOM_RELEASE_BASE_URL: pathToFileURL(release).href,
          ...extra,
        },
        encoding: 'utf8',
      });
    writeFileSync(`${home}/.zshrc`, '# existing zsh settings\n');
    writeFileSync(`${home}/.bash_profile`, '# existing bash settings\n');
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /PointDOM 0.1.0 is ready/);
    assert.match(first.stdout, /1\/4.*Downloading/);
    assert.match(first.stdout, /4\/4.*Starting background service/);
    assert.match(first.stdout, /Next steps/);
    assert.doesNotMatch(first.stdout + first.stderr, /[\u3400-\u9fff]|\x1b/);
    assert.doesNotMatch(first.stdout, /bash_profile|source /);
    assert.equal(readFileSync(`${home}/.zshrc`, 'utf8'), '# existing zsh settings\n');
    assert.equal(readFileSync(`${home}/.bash_profile`, 'utf8'), '# existing bash settings\n');
    assert.ok(first.stdout.includes('export PATH="$HOME/.local/bin:$PATH"'));
    for (const profile of ['.zshrc', '.bash_profile']) {
      const output = profile === '.zshrc' ? first.stdout : run('/bin/bash').stdout;
      const command = output.split('\n').find((line) => line.includes(`>> "$HOME/${profile}"`));
      assert.ok(command);
      // Execute only the printed append command, never source the user's profile.
      const applied = spawnSync('sh', ['-c', command], {
        env: { ...process.env, HOME: home },
        encoding: 'utf8',
      });
      assert.equal(applied.status, 0, applied.stderr);
      assert.match(
        readFileSync(`${home}/${profile}`, 'utf8'),
        /export PATH="\$HOME\/\.local\/bin:\$PATH"/,
      );
    }
    const repeated = run();
    assert.equal(repeated.status, 0);
    assert.ok(repeated.stdout.includes('>> "$HOME/.zshrc"'));
    assert.equal(readFileSync(`${home}/.zshrc`, 'utf8').split('export PATH').length, 2);
    const previousCli = join(directory, 'previous.mjs');
    writeFileSync(
      previousCli,
      `import {mkdirSync,writeFileSync,rmSync} from 'node:fs';
      import {join} from 'node:path';
      const dir=join(process.env.HOME,'Library/LaunchAgents');
      const plist=join(dir,'dev.pointdom.bridge.plist');
      switch(process.argv[2]) {
        case 'version': console.log(process.env.FIXTURE_VERSION || 'pdo 0.0.9'); break;
        case 'upgrade-stop': if(process.env.FIXTURE_BUSY==='1')process.exit(1); rmSync(plist,{force:true}); break;
        case 'uninstall': rmSync(plist,{force:true}); break;
        case 'install': mkdirSync(dir,{recursive:true});writeFileSync(plist,'restored'); break;
        default: process.exit(1);
      }`,
    );
    const upgradeEnv = {
      POINTDOM_UPGRADE_CLI: previousCli,
      POINTDOM_UPGRADE_NODE: process.execPath,
    };
    const current = run('/bin/zsh', { ...upgradeEnv, FIXTURE_VERSION: 'pdo 0.1.0' }, ['--upgrade']);
    assert.equal(current.status, 0, current.stderr);
    assert.match(current.stdout, /already up to date/);
    const busy = run('/bin/zsh', { ...upgradeEnv, FIXTURE_BUSY: '1' }, ['--upgrade']);
    assert.notEqual(busy.status, 0);
    assert.match(busy.stderr, /Upgrade paused/);
    assert.equal(
      readFileSync(`${home}/Library/LaunchAgents/dev.pointdom.bridge.plist`, 'utf8'),
      'fixture',
    );
    const broken = run('/bin/zsh', { ...upgradeEnv, FIXTURE_INSTALL_FAIL: '1' }, ['--upgrade']);
    assert.notEqual(broken.status, 0);
    assert.match(broken.stderr, /Restoring the previous/);
    assert.equal(
      readFileSync(`${home}/Library/LaunchAgents/dev.pointdom.bridge.plist`, 'utf8'),
      'restored',
    );
    const upgraded = run('/bin/zsh', upgradeEnv, ['--upgrade']);
    assert.equal(upgraded.status, 0, upgraded.stderr);
    assert.match(upgraded.stdout, /PointDOM 0.1.0 updated/);
    assert.match(upgraded.stdout, /Project bindings, pairing and history were preserved/);
    assert.match(upgraded.stdout, /fixture: reload requested/);
    assert.doesNotMatch(upgraded.stdout, /pdo setup|Next steps/);
    assert.equal(
      readFileSync(`${home}/Library/LaunchAgents/dev.pointdom.bridge.plist`, 'utf8'),
      'fixture',
    );
    const onPath = run('/bin/zsh', { PATH: `${home}/.local/bin:${bin}:${process.env.PATH}` });
    assert.doesNotMatch(onPath.stdout, /export PATH|>>/);
    assert.match(onPath.stdout, /already installed. No changes made/);
    assert.match(onPath.stdout, /pdo upgrade/);
    const unknownShell = run('/bin/fish');
    assert.doesNotMatch(unknownShell.stdout, /zshrc|bash_profile|>>/);
    assert.match(unknownShell.stdout, /shell profile/);
    // Existing installations must not require OpenCode merely to show next steps.
    rmSync(`${bin}/opencode`);
    // Hide any real OpenCode in the developer's PATH.
    const systemPath = `${bin}:/usr/bin:/bin`;
    assert.equal(run('/bin/zsh', { PATH: systemPath }).status, 0);
    rmSync(`${home}/Library`, { recursive: true });
    rmSync(`${home}/.local`, { recursive: true });
    const noCli = run('/bin/zsh', { PATH: systemPath });
    assert.equal(noCli.status, 0, noCli.stderr);
    assert.match(noCli.stdout, /is ready/);
    rmSync(`${home}/Library`, { recursive: true });
    rmSync(`${home}/.local`, { recursive: true });
    writeFileSync(`${bin}/opencode`, '#!/bin/sh\necho fixture\n', { mode: 0o700 });
    writeFileSync(`${release}/SHA256SUMS`, `${'0'.repeat(64)}  pointdom.tar.gz\n`);
    const tampered = run();
    assert.notEqual(tampered.status, 0);
    assert.match(tampered.stderr, /Checksum mismatch/);
    assert.doesNotMatch(tampered.stderr, /[\u3400-\u9fff]/);
    assert.equal(existsSync(`${home}/Library`), false);
    rmSync(`${release}/pointdom.tar.gz`);
    const missing = run();
    assert.notEqual(missing.status, 0);
    assert.equal(missing.stdout.includes('is ready'), false);
    assert.match(missing.stderr, /Could not download pointdom.tar.gz/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
