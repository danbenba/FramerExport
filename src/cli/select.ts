import readline from 'node:readline';
import { stdin, stdout } from 'node:process';
import { stripAnsi, ui } from './theme.js';

export interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export async function select(
  question: string,
  options: SelectOption[],
  defaultIndex: number = 0
): Promise<string> {
  const isTTY = stdin.isTTY && stdout.isTTY;

  if (!isTTY) {
    return fallbackPrompt(question, options, defaultIndex);
  }

  return arrowSelect(question, options, defaultIndex);
}

async function arrowSelect(
  question: string,
  options: SelectOption[],
  defaultIndex: number
): Promise<string> {
  const questionRow = await queryCursorRow();

  return new Promise((resolve) => {
    const firstEnabled: number = options.findIndex((option) => !option.disabled);
    let selected: number = options[defaultIndex]?.disabled ? firstEnabled : defaultIndex;
    if (selected < 0) selected = 0;

    const move = (direction: -1 | 1): void => {
      let next = selected + direction;
      while (next >= 0 && next < options.length) {
        if (!options[next].disabled) {
          selected = next;
          return;
        }
        next += direction;
      }
    };

    const render = (initial: boolean = false): void => {
      if (!initial) {
        stdout.write(`\x1B[${options.length + 1}A`);
        stdout.write('\x1B[J');
      }
      console.log(`  ${ui.primary('●')} ${ui.text.bold(question)}`);
      for (let i = 0; i < options.length; i++) {
        if (options[i].disabled) {
          console.log(`      ${ui.muted(stripAnsi(options[i].label))}`);
        } else if (i === selected) {
          console.log(`    ${ui.primary('>')} ${ui.text.bold(options[i].label)}`);
        } else {
          console.log(`      ${ui.muted(options[i].label)}`);
        }
      }
    };

    const choose = (): void => {
      cleanup();

      stdout.write(`\x1B[${options.length + 1}A`);
      stdout.write('\x1B[J');
      console.log(
        `  ${ui.success('✓')} ${ui.text.bold(question)} ${ui.primary(stripAnsi(options[selected].label))}\n`
      );

      resolve(options[selected].value);
    };

    const onMouseData = (chunk: Buffer): void => {
      const mouse = parseMouseEvent(chunk);
      if (!mouse) return;

      if (mouse.kind === 'wheel-up') {
        move(-1);
        render();
        return;
      }

      if (mouse.kind === 'wheel-down') {
        move(1);
        render();
        return;
      }

      if (mouse.kind !== 'click' || questionRow === null) return;
      const idx = mouse.y - questionRow - 1;
      if (idx < 0 || idx >= options.length || options[idx].disabled) return;

      selected = idx;
      render();
      choose();
    };

    const cleanup = (): void => {
      disableMouse();
      stdin.setRawMode(false);
      stdin.removeListener('keypress', onKeypress);
      stdin.removeListener('data', onMouseData);
      stdin.pause();
    };

    render(true);

    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    enableMouse();

    const onKeypress = (_str: string | undefined, key: readline.Key): void => {
      if (!key) return;

      if (key.name === 'up' && selected > 0) {
        move(-1);
        render();
      } else if (key.name === 'down' && selected < options.length - 1) {
        move(1);
        render();
      } else if (key.name === 'return') {
        choose();
      } else if ((key.ctrl && key.name === 'c') || key.name === 'escape') {
        cleanup();
        process.exit(0);
      }
    };

    stdin.resume();
    stdin.on('data', onMouseData);
    stdin.on('keypress', onKeypress);
  });
}

async function fallbackPrompt(
  question: string,
  options: SelectOption[],
  defaultIndex: number
): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const firstEnabled: number = options.findIndex((option) => !option.disabled);
    const enabledDefault: number = options[defaultIndex]?.disabled ? firstEnabled : defaultIndex;

    console.log(`  ${ui.primary('●')} ${ui.text.bold(question)}\n`);
    for (let i = 0; i < options.length; i++) {
      const marker = i === enabledDefault ? ui.success(' ◆') : '  ';
      const label = options[i].disabled
        ? ui.muted(stripAnsi(options[i].label))
        : ui.text(options[i].label);
      console.log(`   ${ui.muted(`[${i + 1}]`)}${marker} ${label}`);
    }
    console.log('');
    const def = String(enabledDefault + 1);

    const ask = (): void => {
      rl.question(
        `  ${ui.primary('>')} ${ui.muted(`Choose [1-${options.length}] (${def})`)}: `,
        (answer) => {
          const trimmed = answer.trim();
          if (!trimmed) {
            rl.close();
            const label = stripAnsi(options[enabledDefault].label);
            console.log(`  ${ui.success('✓')} ${ui.primary(label)}\n`);
            resolve(options[enabledDefault].value);
            return;
          }
          const idx = parseInt(trimmed, 10);
          if (idx >= 1 && idx <= options.length && !options[idx - 1].disabled) {
            rl.close();
            const label = stripAnsi(options[idx - 1].label);
            console.log(`  ${ui.success('✓')} ${ui.primary(label)}\n`);
            resolve(options[idx - 1].value);
          } else if (idx >= 1 && idx <= options.length && options[idx - 1].disabled) {
            console.log(`  ${ui.error('✗')} ${ui.warning('Option unavailable for now')}\n`);
            ask();
          } else {
            console.log(`  ${ui.error('✗')} ${ui.warning(`Enter 1-${options.length}`)}\n`);
            ask();
          }
        }
      );
    };
    ask();
  });
}

type MouseEventInfo =
  | { kind: 'click'; x: number; y: number }
  | { kind: 'wheel-up'; x: number; y: number }
  | { kind: 'wheel-down'; x: number; y: number };

function enableMouse(): void {
  stdout.write('\x1B[?1000h\x1B[?1006h');
}

function disableMouse(): void {
  stdout.write('\x1B[?1000l\x1B[?1006l');
}

function parseMouseEvent(chunk: Buffer): MouseEventInfo | null {
  const text = chunk.toString('utf-8');
  const match = text.match(/\x1B\[<(\d+);(\d+);(\d+)([mM])/);
  if (!match) return null;

  const code = Number(match[1]);
  const x = Number(match[2]);
  const y = Number(match[3]);
  const state = match[4];
  if (state !== 'M') return null;

  if (code === 64) return { kind: 'wheel-up', x, y };
  if (code === 65) return { kind: 'wheel-down', x, y };
  if ((code & 3) === 0) return { kind: 'click', x, y };
  return null;
}

function queryCursorRow(): Promise<number | null> {
  if (!stdin.isTTY || !stdout.isTTY) return Promise.resolve(null);

  return new Promise((resolve) => {
    const wasRaw = stdin.isRaw;
    let done = false;

    const finish = (row: number | null): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stdin.removeListener('data', onData);
      if (!wasRaw) stdin.setRawMode(false);
      resolve(row);
    };

    const onData = (chunk: Buffer): void => {
      const match = chunk.toString('utf-8').match(/\x1B\[(\d+);\d+R/);
      if (!match) return;
      finish(Number(match[1]));
    };

    const timer = setTimeout(() => finish(null), 80);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
    stdout.write('\x1B[6n');
  });
}
