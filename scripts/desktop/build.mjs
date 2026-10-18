import { execFileSync } from 'node:child_process';
import { cp, mkdir } from 'node:fs/promises';
const debug = process.argv.includes('--debug');
execFileSync(
  'cargo',
  ['build', '--locked', ...(debug ? [] : ['--release']), '-p', 'pointdom-cli'],
  {
    stdio: 'inherit',
  },
);
await mkdir('dist/native', { recursive: true });
await cp(
  `target/${debug ? 'debug' : 'release'}/pointdom${process.platform === 'win32' ? '.exe' : ''}`,
  'dist/native/pointdom',
);

await import('../notices.mjs');
