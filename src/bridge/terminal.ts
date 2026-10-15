import { createInterface, emitKeypressEvents } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
export interface Choice {
  value: string;
  label: string;
}
type Input = Readable & {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?: (enabled: boolean) => unknown;
};
type Output = Writable & { isTTY?: boolean; columns?: number };
export function cancelledSetup() {
  return Object.assign(new Error('Setup stopped. Run pdo setup to continue.'), {
    code: 'SETUP_CANCELLED',
  });
}
export function askLine(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let answered = false;
    rl.once('SIGINT', () => rl.close());
    rl.once('close', () => {
      if (!answered) reject(cancelledSetup());
    });
    rl.question(question, (answer) => {
      answered = true;
      rl.close();
      resolve(answer);
    });
  });
}
/** Raw mode exists only while the selector is active and is restored on every exit. */
export function selectChoice(
  question: string,
  choices: readonly Choice[],
  color = false,
  input: Input = process.stdin,
  output: Output = process.stdout,
): Promise<string> {
  if (!choices.length) return Promise.reject(new Error('No menu choices.'));
  if (!input.isTTY || !output.isTTY || !input.setRawMode)
    return Promise.reject(new Error('Arrow selection requires an interactive terminal.'));
  const setRawMode = input.setRawMode.bind(input);
  return new Promise((resolve, reject) => {
    let index = 0,
      drawn = false,
      finished = false;
    const wasRaw = input.isRaw === true,
      wasFlowing = input.readableFlowing;
    const clip = (text: string) => text.slice(0, Math.max(8, (output.columns || 80) - 2));
    const render = () => {
      if (drawn) output.write(`\x1b[${choices.length + 1}A`);
      output.write(`\r\x1b[2K${clip(question + ' (Up/Down, Enter)')}\n`);
      choices.forEach((choice, i) => {
        const label = clip(`${i === index ? '>' : ' '} ${choice.label}`);
        output.write(
          `\r\x1b[2K${color && i === index ? '\x1b[32m' : ''}${label}${color ? '\x1b[0m' : ''}\n`,
        );
      });
      drawn = true;
    };
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      input.removeListener('keypress', keypress);
      process.removeListener('SIGINT', abort);
      setRawMode(wasRaw);
      if (!wasFlowing) input.pause();
      output.write('\x1b[?25h');
      if (error) reject(error);
      else resolve(choices[index]!.value);
    };
    const abort = () => finish(cancelledSetup());
    const keypress = (_text: string, key: { name?: string; ctrl?: boolean } = {}) => {
      if ((key.ctrl && ['c', 'd'].includes(key.name || '')) || key.name === 'escape')
        return abort();
      if (key.name === 'return' || key.name === 'enter') return finish();
      if (key.name === 'up') index = (index + choices.length - 1) % choices.length;
      else if (key.name === 'down') index = (index + 1) % choices.length;
      else if (key.name === 'home') index = 0;
      else if (key.name === 'end') index = choices.length - 1;
      else return;
      render();
    };
    emitKeypressEvents(input);
    input.on('keypress', keypress);
    process.once('SIGINT', abort);
    setRawMode(true);
    input.resume();
    output.write('\x1b[?25l');
    render();
  });
}
