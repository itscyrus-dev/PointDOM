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
      if(process.argv[2] !== 'install')process.exit(1);
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
    const run = () =>
      spawnSync('sh', [resolve('install.sh')], {
        env: {
          ...process.env,
          HOME: home,
          SHELL: '/bin/zsh',
          PATH: `${bin}:${process.env.PATH}`,
          POINTDOM_RELEASE_BASE_URL: pathToFileURL(release).href,
        },
        encoding: 'utf8',
      });
    writeFileSync(`${home}/.zshrc`, '# existing zsh settings\n');
    writeFileSync(`${home}/.bash_profile`, '# existing bash settings\n');
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /已安装/);
    assert.equal(readFileSync(`${home}/.zshrc`, 'utf8'), '# existing zsh settings\n');
    assert.equal(readFileSync(`${home}/.bash_profile`, 'utf8'), '# existing bash settings\n');
    assert.ok(first.stdout.includes('export PATH="$HOME/.local/bin:$PATH"'));
    for (const profile of ['.zshrc', '.bash_profile']) {
      const command = first.stdout
        .split('\n')
        .find((line) => line.includes(`>> "$HOME/${profile}"`));
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
    rmSync(`${home}/Library`, { recursive: true });
    rmSync(`${home}/.local`, { recursive: true });
    writeFileSync(`${release}/SHA256SUMS`, `${'0'.repeat(64)}  pointdom.tar.gz\n`);
    const tampered = run();
    assert.notEqual(tampered.status, 0);
    assert.match(tampered.stderr, /校验失败/);
    assert.equal(existsSync(`${home}/Library`), false);
    rmSync(`${release}/pointdom.tar.gz`);
    const missing = run();
    assert.notEqual(missing.status, 0);
    assert.equal(missing.stdout.includes('已安装'), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
