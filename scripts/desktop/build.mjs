import { execFileSync } from 'node:child_process';
import { cp, mkdir } from 'node:fs/promises';
execFileSync('cargo', ['build', '--locked', '--release', '-p', 'pointdom-cli'], {
  stdio: 'inherit',
});
await mkdir('dist/native', { recursive: true });
await cp(
  `target/release/pointdom${process.platform === 'win32' ? '.exe' : ''}`,
  'dist/native/pointdom',
);

await import('../notices.mjs');
