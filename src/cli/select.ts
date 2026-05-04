import readline from 'node:readline';
import { stdin, stdout } from 'node:process';
import { maxWidth, panelBot, panelLine, panelSep, panelTop } from './box.js';
import { centerText, stripAnsi, truncatePlain, ui } from './theme.js';

export interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface SelectAction {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface SelectConfig {
  headerLines?: string[];
  actions?: SelectAction[];
  footer?: string;
}

let pipedLinesPromise: Promise<string[]> | null = null;
let pipedLineIndex = 0;

export async function select(
  question: string,
  options: SelectOption[],
  defaultIndex: number = 0,
  config: SelectConfig = {}
): Promise<string> {
  const isTTY = stdin.isTTY && stdout.isTTY;

  if (!isTTY) {
    return fallbackPrompt(question, options, defaultIndex, config);
  }

  return arrowSelect(question, options, defaultIndex, config);
}

export async function promptInput(
  question: string,
  defaultValue: string = '',
  config: Omit<SelectConfig, 'actions'> = {}
): Promise<string> {
  if (!stdin.isTTY || !stdout.isTTY) {
    return fallbackInput(question, defaultValue);
  }

  return fullscreenInput(question, defaultValue, config);
}

async function arrowSelect(
  question: string,
  options: SelectOption[],
  defaultIndex: number,
  config: SelectConfig
): Promise<string> {
  const actions = config.actions ?? [];
  const headerLines = config.headerLines ?? [];
  const width = Math.max(44, Math.min(maxWidth(), 72));
  const inner = width - 4;
  const actionLineOffset = 2 + headerLines.length;
  const hasActions = actions.length > 0;
  const optionStartOffset = 3 + headerLines.length + (hasActions ? 1 : 0);
  const lineCount = options.length + 4 + headerLines.length + (hasActions ? 1 : 0);
  const rows = process.stdout.rows || 24;
  const columns = process.stdout.columns || 80;
  const panelTopRow = Math.max(2, Math.floor((rows - lineCount) / 2) + 1);
  const panelLeftCol = Math.max(1, Math.floor((columns - width) / 2) + 1);
  const footerRow = Math.min(rows, panelTopRow + lineCount + 1);

  return new Promise((resolve) => {
    const firstEnabled: number = options.findIndex((option) => !option.disabled);
    let selected: number = options[defaultIndex]?.disabled ? firstEnabled : defaultIndex;
    let selectedAction: number | null = null;
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
      for (const header of headerLines) {
        lines.push(panelLine(width, centerText(ui.muted(header), inner)));
      }
      if (hasActions) {
        lines.push(
          panelLine(width, centerText(renderActions(actions, selectedAction, inner), inner))
        );
      }
      lines.push(panelSep(width));
      for (let i = 0; i < options.length; i++) {
        lines.push(
          panelLine(
            width,
            centerText(
              renderOption(options[i], selectedAction === null && i === selected, inner),
              inner
            )
          )
        );
      }
      lines.push(panelBot(width));

      lines.forEach((line, index) => writeAt(panelTopRow + index, panelLeftCol, line));
      writeAt(
        footerRow,
        panelLeftCol,
        centerText(
          ui.muted(config.footer || '↑↓ move  ·  enter select  ·  mouse hover/click  ·  esc close'),
          width
        )
      );
    };

    const choose = (value: string = options[selected].value): void => {
      cleanup();
      console.log(
        `  ${ui.success('✓')} ${ui.text.bold(question)} ${ui.primary(labelForValue(value, options, actions))}\n`
      );

      resolve(value);
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

      if (hasActions && mouse.y === panelTopRow + actionLineOffset) {
        const actionIdx = actionIndexAtX(actions, mouse.x, panelLeftCol, inner);
        if (actionIdx === null || actions[actionIdx].disabled) return;
        if (selectedAction !== actionIdx) {
          selectedAction = actionIdx;
          render();
        }
        if (mouse.kind === 'click') choose(actions[actionIdx].value);
        return;
      }

      const idx = mouse.y - panelTopRow - optionStartOffset;
      if (idx < 0 || idx >= options.length || options[idx].disabled) return;

      if (selected !== idx) {
        selected = idx;
        selectedAction = null;
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
    enterInteractiveScreen(true);
    render(true);

    const onKeypress = (_str: string | undefined, key: readline.Key): void => {
      if (!key) return;

      if (key.name === 'up' && selected > 0) {
        move(-1);
        selectedAction = null;
        render();
      } else if (key.name === 'down' && selected < options.length - 1) {
        move(1);
        selectedAction = null;
        render();
      } else if (key.name === 'tab' && hasActions) {
        selectedAction = selectedAction === null ? 0 : null;
        render();
      } else if (key.name === 'return') {
        choose(selectedAction === null ? options[selected].value : actions[selectedAction].value);
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
  defaultIndex: number,
  config: SelectConfig
): Promise<string> {
  if (!stdin.isTTY) {
    const firstEnabled: number = options.findIndex((option) => !option.disabled);
    const enabledDefault: number = options[defaultIndex]?.disabled ? firstEnabled : defaultIndex;
    const def = String(enabledDefault + 1);

    printFallbackOptions(question, options, enabledDefault, config);

    while (true) {
      const trimmed = (await readPipedLine()).trim();
      if (trimmed.toLowerCase() === 'a') {
        const action = config.actions?.find((item) => !item.disabled);
        if (action) return action.value;
      }
      if (!trimmed) {
        const label = stripAnsi(options[enabledDefault].label);
        console.log(`  ${ui.success('✓')} ${ui.primary(label)}\n`);
        return options[enabledDefault].value;
      }
      const idx = parseInt(trimmed, 10);
      if (idx >= 1 && idx <= options.length && !options[idx - 1].disabled) {
        const label = stripAnsi(options[idx - 1].label);
        console.log(`  ${ui.success('✓')} ${ui.primary(label)}\n`);
        return options[idx - 1].value;
      }
      console.log(`  ${ui.error('✗')} ${ui.warning(`Enter 1-${options.length} or ${def}`)}\n`);
    }
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const firstEnabled: number = options.findIndex((option) => !option.disabled);
    const enabledDefault: number = options[defaultIndex]?.disabled ? firstEnabled : defaultIndex;

    printFallbackOptions(question, options, enabledDefault, config);
    const def = String(enabledDefault + 1);

    const ask = (): void => {
      rl.question(
        `  ${ui.primary('>')} ${ui.muted(`Choose [1-${options.length}] (${def})`)}: `,
        (answer) => {
          const trimmed = answer.trim();
          if (trimmed.toLowerCase() === 'a') {
            const action = config.actions?.find((item) => !item.disabled);
            if (action) {
              rl.close();
              resolve(action.value);
              return;
            }
          }
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

function fullscreenInput(
  question: string,
  defaultValue: string,
  config: Omit<SelectConfig, 'actions'>
): Promise<string> {
  const headerLines = config.headerLines ?? [];
  const width = Math.max(44, Math.min(maxWidth(), 72));
  const inner = width - 4;
  const lineCount = 6 + headerLines.length;
  const rows = process.stdout.rows || 24;
  const columns = process.stdout.columns || 80;
  const panelTopRow = Math.max(2, Math.floor((rows - lineCount) / 2) + 1);
  const panelLeftCol = Math.max(1, Math.floor((columns - width) / 2) + 1);
  const footerRow = Math.min(rows, panelTopRow + lineCount + 1);

  return new Promise((resolve) => {
    let value = defaultValue;

    const render = (): void => {
      stdout.write('\x1B[2J');
      const shown = value || '';
      const clipped = truncatePlain(shown, Math.max(12, inner - 10));
      const input = `${ui.primary('>')} ${ui.text(clipped)}${ui.primary('▌')}`;
      const lines: string[] = [];
      lines.push(panelTop(width));
      lines.push(
        panelLine(width, centerText(`${ui.primary('●')} ${ui.text.bold(question)}`, inner))
      );
      for (const header of headerLines) {
        lines.push(panelLine(width, centerText(ui.muted(header), inner)));
      }
      lines.push(panelSep(width));
      lines.push(panelLine(width, centerText(input, inner)));
      lines.push(panelBot(width));

      lines.forEach((line, index) => writeAt(panelTopRow + index, panelLeftCol, line));
      writeAt(
        footerRow,
        panelLeftCol,
        centerText(ui.muted(config.footer || 'type value  ·  enter confirm  ·  esc close'), width)
      );
    };

    const cleanup = (): void => {
      leaveInteractiveScreen();
      stdin.setRawMode(false);
      stdin.removeListener('keypress', onKeypress);
      stdin.pause();
    };

    const submit = (): void => {
      const output = cleanInputValue(value.trim() || defaultValue);
      cleanup();
      resolve(output);
    };

    const onKeypress = (str: string | undefined, key: readline.Key): void => {
      if ((key.ctrl && key.name === 'c') || key.name === 'escape') {
        cleanup();
        process.exit(0);
      }
      if (key.name === 'return') {
        submit();
        return;
      }
      if (key.name === 'backspace') {
        value = value.slice(0, -1);
        render();
        return;
      }
      if (key.name === 'delete') {
        value = '';
        render();
        return;
      }
      if (str && !key.ctrl && !key.meta && str >= ' ' && !isTerminalSequence(str, key)) {
        value += cleanInputValue(str.replace(/[\r\n]/g, ''));
        render();
      }
    };

    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    enterInteractiveScreen(false);
    render();
    stdin.resume();
    stdin.on('keypress', onKeypress);
  });
}

async function fallbackInput(question: string, defaultValue: string): Promise<string> {
  if (!stdin.isTTY) {
    const suffix = defaultValue ? ui.muted(` (${defaultValue})`) : '';
    console.log(`  ${ui.primary('>')} ${ui.text.bold(question)}${suffix}: `);
    const answer = await readPipedLine();
    return cleanInputValue(answer.trim() || defaultValue);
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const suffix = defaultValue ? ui.muted(` (${defaultValue})`) : '';
    rl.question(`  ${ui.primary('>')} ${ui.text.bold(question)}${suffix}: `, (answer) => {
      rl.close();
      resolve(cleanInputValue(answer.trim() || defaultValue));
    });
  });
}

function printFallbackOptions(
  question: string,
  options: SelectOption[],
  enabledDefault: number,
  config: SelectConfig
): void {
  console.log(`  ${ui.primary('●')} ${ui.text.bold(question)}\n`);
  for (const header of config.headerLines ?? []) {
    console.log(`  ${ui.muted(header)}`);
  }
  for (const action of config.actions ?? []) {
    console.log(
      `   ${ui.muted('[A]')} ${action.disabled ? ui.muted(action.label) : ui.text(action.label)}`
    );
  }
  if ((config.headerLines?.length || 0) > 0 || (config.actions?.length || 0) > 0) {
    console.log('');
  }
  for (let i = 0; i < options.length; i++) {
    const marker = i === enabledDefault ? ui.success(' ◆') : '  ';
    const label = options[i].disabled
      ? ui.muted(stripAnsi(options[i].label))
      : ui.text(options[i].label);
    console.log(`   ${ui.muted(`[${i + 1}]`)}${marker} ${label}`);
  }
  console.log('');
}

function readPipedLine(): Promise<string> {
  if (!pipedLinesPromise) {
    pipedLinesPromise = new Promise((resolve) => {
      let data = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (chunk) => {
        data += chunk;
      });
      stdin.on('end', () => {
        resolve(data.split(/\r?\n/));
      });
      stdin.on('error', () => {
        resolve([]);
      });
    });
  }

  return pipedLinesPromise.then((lines) => lines[pipedLineIndex++] ?? '');
}

function renderActions(actions: SelectAction[], active: number | null, width: number): string {
  return actions
    .map((action, index) => {
      const label = truncatePlain(
        stripAnsi(action.label),
        Math.max(8, Math.floor(width / actions.length) - 8)
      );
      if (action.disabled) return `${ui.border('[')} ${ui.muted(label)} ${ui.border(']')}`;
      if (active === index)
        return `${ui.primary('›')} ${ui.primary('[')} ${ui.text.bold(label)} ${ui.primary(']')} ${ui.primary('‹')}`;
      return `${ui.border('[')} ${ui.primary(label)} ${ui.border(']')}`;
    })
    .join(` ${ui.muted('·')} `);
}

function actionIndexAtX(
  actions: SelectAction[],
  mouseX: number,
  panelLeftCol: number,
  inner: number
): number | null {
  if (actions.length === 0) return null;
  const contentStart = panelLeftCol + 2;
  const relative = mouseX - contentStart;
  if (relative < 0 || relative > inner) return null;
  return Math.min(actions.length - 1, Math.floor((relative / Math.max(1, inner)) * actions.length));
}

function labelForValue(value: string, options: SelectOption[], actions: SelectAction[]): string {
  return stripAnsi(
    options.find((option) => option.value === value)?.label ||
      actions.find((action) => action.value === value)?.label ||
      value
  );
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

function enterInteractiveScreen(enableMouse: boolean): void {
  stdout.write('\x1B[?1049h' + '\x1B[2J' + '\x1B[H' + '\x1B[?25l');
  if (enableMouse) {
    stdout.write('\x1B[?1006h' + '\x1B[?1000h' + '\x1B[?1002h' + '\x1B[?1003h');
  }
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

function isTerminalSequence(str: string, key: readline.Key): boolean {
  return (
    str.includes('\x1B') || !!key.sequence?.includes('\x1B') || /^(?:\d+;){2}\d+[mM]$/.test(str)
  );
}

function cleanInputValue(value: string): string {
  return value
    .replace(/\x1B\[<\d+;\d+;\d+[mM]/g, '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/(?:\d+;){2}\d+[mM]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}
