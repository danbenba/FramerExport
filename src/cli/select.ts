import readline from 'node:readline';
import { stdin, stdout } from 'node:process';
import { maxWidth, panelBot, panelLine, panelSep, panelTop } from './box.js';
import { centerText, stripAnsi, truncatePlain, ui } from './theme.js';

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
  const width = Math.max(44, Math.min(maxWidth(), 72));
  const inner = width - 4;
  const optionStartOffset = 3;
  const lineCount = options.length + 4;
  const rows = process.stdout.rows || 24;
  const columns = process.stdout.columns || 80;
  const panelTopRow = Math.max(2, Math.floor((rows - lineCount) / 2) + 1);
  const panelLeftCol = Math.max(1, Math.floor((columns - width) / 2) + 1);
  const footerRow = Math.min(rows, panelTopRow + lineCount + 1);

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
        stdout.write('\x1B[2J');
      }
      const lines: string[] = [];
      lines.push(panelTop(width));
      lines.push(
        panelLine(width, centerText(`${ui.primary('●')} ${ui.text.bold(question)}`, inner))
      );
      lines.push(panelSep(width));
      for (let i = 0; i < options.length; i++) {
        lines.push(
          panelLine(width, centerText(renderOption(options[i], i === selected, inner), inner))
        );
      }
      lines.push(panelBot(width));

      lines.forEach((line, index) => writeAt(panelTopRow + index, panelLeftCol, line));
      writeAt(
        footerRow,
        panelLeftCol,
        centerText(ui.muted('↑↓ move  ·  enter select  ·  mouse hover/click  ·  esc close'), width)
      );
    };

    const choose = (): void => {
      cleanup();
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

      const idx = mouse.y - panelTopRow - optionStartOffset;
      if (idx < 0 || idx >= options.length || options[idx].disabled) return;

      if (selected !== idx) {
        selected = idx;
        render();
      }

      if (mouse.kind === 'click') {
        choose();
      }
    };

    const cleanup = (): void => {
      leaveInteractiveScreen();
      stdin.setRawMode(false);
      stdin.removeListener('keypress', onKeypress);
      stdin.removeListener('data', onMouseData);
      stdin.pause();
    };

    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    enterInteractiveScreen();
    render(true);

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
  | { kind: 'hover'; x: number; y: number }
  | { kind: 'wheel-up'; x: number; y: number }
  | { kind: 'wheel-down'; x: number; y: number };

function renderOption(option: SelectOption, selected: boolean, width: number): string {
  const plain = truncatePlain(stripAnsi(option.label), Math.max(10, width - 12));
  if (option.disabled) {
    return `${ui.border('[')} ${ui.muted(plain)} ${ui.border(']')}`;
  }
  if (selected) {
    return `${ui.primary('›')} ${ui.primary('[')} ${ui.text.bold(plain)} ${ui.primary(']')} ${ui.primary('‹')}`;
  }
  return `${ui.muted(' ')} ${ui.border('[')} ${ui.muted(plain)} ${ui.border(']')} ${ui.muted(' ')}`;
}

function enterInteractiveScreen(): void {
  stdout.write(
    '\x1B[?1049h' +
      '\x1B[2J' +
      '\x1B[H' +
      '\x1B[?25l' +
      '\x1B[?1006h' +
      '\x1B[?1000h' +
      '\x1B[?1002h' +
      '\x1B[?1003h'
  );
}

function leaveInteractiveScreen(): void {
  stdout.write(
    '\x1B[?1003l' + '\x1B[?1002l' + '\x1B[?1000l' + '\x1B[?1006l' + '\x1B[?25h' + '\x1B[?1049l'
  );
}

function parseMouseEvent(chunk: Buffer): MouseEventInfo | null {
  const text = chunk.toString('utf-8');
  const match = text.match(/\x1B\[<(\d+);(\d+);(\d+)([mM])/);
  if (!match) return parseLegacyMouseEvent(text);

  const code = Number(match[1]);
  const x = Number(match[2]);
  const y = Number(match[3]);
  const state = match[4];
  if (code === 64) return { kind: 'wheel-up', x, y };
  if (code === 65) return { kind: 'wheel-down', x, y };
  if (state === 'm') return { kind: 'click', x, y };
  if ((code & 32) === 32 || code === 35) return { kind: 'hover', x, y };
  if ((code & 3) === 0) return { kind: 'hover', x, y };
  return null;
}

function parseLegacyMouseEvent(text: string): MouseEventInfo | null {
  const match = text.match(/\x1B\[M([\s\S])([\s\S])([\s\S])/);
  if (!match) return null;

  const code = match[1].charCodeAt(0) - 32;
  const x = match[2].charCodeAt(0) - 32;
  const y = match[3].charCodeAt(0) - 32;

  if (code === 64) return { kind: 'wheel-up', x, y };
  if (code === 65) return { kind: 'wheel-down', x, y };
  if ((code & 3) === 3) return { kind: 'click', x, y };
  if ((code & 32) === 32) return { kind: 'hover', x, y };
  return { kind: 'hover', x, y };
}

function writeAt(row: number, col: number, text: string): void {
  stdout.write(`\x1B[${row};${col}H${text}`);
}
