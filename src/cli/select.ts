import readline from 'node:readline';
import { RawInput, type InputEvent } from './input.js';
import chalk from 'chalk';
import { stdin, stdout } from 'node:process';
import { maxWidth } from './box.js';
import { Backdrop } from './backdrop.js';
import { centerText, stripAnsi, truncatePlain, THEME, ui } from './theme.js';
function panelRow(width: number, content: string = ''): string {
  const visible = stripAnsi(content).length;
  const pad = Math.max(0, width - visible);
  return chalk.bgHex(THEME.panel)(content + ' '.repeat(pad));
}
function selectedRow(width: number, content: string): string {
  const visible = content.length;
  const pad = Math.max(0, width - visible);
  return chalk
    .bgHex(THEME.primary)
    .hex(THEME.background)
    .bold(content + ' '.repeat(pad));
}
function titleRow(width: number, title: string): string {
  const left = `  ${ui.text.bold(title)}`;
  const right = `${ui.muted('esc')}  `;
  const visible = stripAnsi(left).length + stripAnsi(right).length;
  const gap = Math.max(1, width - visible);
  return chalk.bgHex(THEME.panel)(left + ' '.repeat(gap) + right);
}
export interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
  heading?: boolean;
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
  searchable?: boolean;
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
    const flat = options.map((o) => (o.heading ? { ...o, disabled: true } : o));
    return fallbackPrompt(question, flat, defaultIndex, config);
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
  const searchable = config.searchable === true;
  const hasActions = actions.length > 0;
  const headerCount = headerLines.length;
  const searchRows = searchable ? 1 : 0;
  const optionStartOffset = 3 + searchRows + headerCount + (headerCount > 0 ? 1 : 0);
  let width = 0;
  let inner = 0;
  let visibleCount = 0;
  let actionLineOffset = 0;
  let lineCount = 0;
  let panelTopRow = 0;
  let panelLeftCol = 0;
  let footerRow = 0;
  const recomputeLayout = (): void => {
    width = Math.max(50, Math.min(maxWidth(), 64));
    inner = width - 4;
    const rows = process.stdout.rows || 24;
    const columns = process.stdout.columns || 80;
    const chromeLines = optionStartOffset + (hasActions ? 3 : 1) + 2;
    const maxVisible = Math.max(4, rows - chromeLines);
    visibleCount = Math.min(options.length, maxVisible);
    actionLineOffset = optionStartOffset + visibleCount + 1;
    lineCount = actionLineOffset + (hasActions ? 2 : 1);
    panelTopRow = Math.max(2, Math.floor((rows - lineCount) / 2) + 1);
    panelLeftCol = Math.max(1, Math.floor((columns - width) / 2) + 1);
    footerRow = Math.min(rows, panelTopRow + lineCount + 1);
  };
  recomputeLayout();
  return new Promise((resolve) => {
    let query = '';
    const buildView = (): number[] => {
      if (!query) return options.map((_, i) => i);
      const q = query.toLowerCase();
      const matched = new Set<number>();
      options.forEach((option, i) => {
        if (!option.heading && stripAnsi(option.label).toLowerCase().includes(q)) matched.add(i);
      });
      const view: number[] = [];
      for (let i = 0; i < options.length; i++) {
        if (options[i].heading) {
          for (let j = i + 1; j < options.length && !options[j].heading; j++) {
            if (matched.has(j)) {
              view.push(i);
              break;
            }
          }
        } else if (matched.has(i)) {
          view.push(i);
        }
      }
      return view;
    };
    let view = buildView();
    const selectableAt = (pos: number): boolean => {
      const option = options[view[pos]];
      return !option.disabled && !option.heading;
    };
    const firstSelectable = (): number => {
      for (let pos = 0; pos < view.length; pos++) if (selectableAt(pos)) return pos;
      return 0;
    };
    let selected =
      defaultIndex >= 0 && defaultIndex < options.length && view.indexOf(defaultIndex) >= 0
        ? view.indexOf(defaultIndex)
        : firstSelectable();
    if (!view.length || !selectableAt(Math.min(selected, Math.max(0, view.length - 1)))) {
      selected = firstSelectable();
    }
    let selectedAction: number | null = null;
    let scrollOffset = 0;
    let prevLines: string[] = [];
    let prevFooter = '';
    const move = (direction: -1 | 1): void => {
      let next = selected + direction;
      while (next >= 0 && next < view.length) {
        if (selectableAt(next)) {
          selected = next;
          return;
        }
        next += direction;
      }
    };
    const syncScroll = (): void => {
      if (view.length <= visibleCount) {
        scrollOffset = 0;
        return;
      }
      const anchor = selected > 0 && options[view[selected - 1]].heading ? selected - 1 : selected;
      if (anchor < scrollOffset) scrollOffset = anchor;
      if (selected >= scrollOffset + visibleCount) scrollOffset = selected - visibleCount + 1;
      scrollOffset = Math.max(0, Math.min(scrollOffset, view.length - visibleCount));
    };
    const backdrop = new Backdrop();
    const syncBackdropExclude = (): void => {
      backdrop.setExclude({
        top: panelTopRow - 1,
        left: panelLeftCol - 2,
        width: width + 4,
        height: lineCount + 3,
      });
    };
    syncBackdropExclude();
    const searchRow = (): string => {
      const clipped = truncatePlain(query, Math.max(10, inner - 6));
      const shown = query
        ? `${chalk.hex(THEME.text)(clipped)}${chalk.hex(THEME.primary)('▌')}`
        : ui.muted('type to search');
      const content = ` ${chalk.hex(THEME.text)('▏')} ${shown}`;
      const visible = stripAnsi(content).length;
      return chalk.bgHex(THEME.element)(content + ' '.repeat(Math.max(0, width - visible)));
    };
    const render = (): void => {
      const lines: string[] = [];
      lines.push(panelRow(width));
      lines.push(titleRow(width, question));
      if (searchable) lines.push(searchRow());
      lines.push(panelRow(width));
      for (const header of headerLines) {
        lines.push(panelRow(width, `   ${ui.muted(truncatePlain(stripAnsi(header), inner))}`));
      }
      if (headerCount > 0) lines.push(panelRow(width));
      syncScroll();
      for (let pos = scrollOffset; pos < scrollOffset + visibleCount; pos++) {
        if (pos < view.length) {
          lines.push(
            renderOption(
              options[view[pos]],
              selectedAction === null && pos === selected,
              view[pos] === defaultIndex,
              width,
              inner
            )
          );
        } else {
          lines.push(panelRow(width));
        }
      }
      if (view.length === 0) {
        lines[optionStartOffset] = panelRow(width, `   ${ui.muted('No results found')}`);
      }
      lines.push(
        view.length > visibleCount
          ? panelRow(width, `   ${ui.muted(`${selected + 1}/${view.length}  scroll for more`)}`)
          : panelRow(width)
      );
      if (hasActions) {
        lines.push(panelRow(width, renderActions(actions, selectedAction)));
        lines.push(panelRow(width));
      }
      const sameLength = prevLines.length === lines.length;
      lines.forEach((line, index) => {
        if (!sameLength || prevLines[index] !== line) {
          writeAt(panelTopRow + index, panelLeftCol, line);
        }
      });
      prevLines = lines;
      const footer = centerText(
        ui.muted(
          config.footer ||
            (searchable
              ? 'type to search   ↑↓ move   enter select   esc close'
              : '↑↓ move   enter select   mouse click   esc close')
        ),
        width
      );
      if (footer !== prevFooter) {
        writeAt(footerRow, panelLeftCol, footer);
        prevFooter = footer;
      }
    };
    const refilter = (): void => {
      view = buildView();
      selected = firstSelectable();
      scrollOffset = 0;
      render();
    };
    const choose = (value?: string): void => {
      if (value === undefined) {
        if (!view.length || !selectableAt(selected)) return;
        value = options[view[selected]].value;
      }
      cleanup();
      console.log(
        `  ${ui.success('✓')} ${ui.text.bold(question)} ${ui.primary(labelForValue(value, options, actions))}\n`
      );
      resolve(value);
    };
    const hitOption = (x: number, y: number): number | null => {
      const relative = y - panelTopRow - optionStartOffset;
      if (relative < 0 || relative >= visibleCount) return null;
      if (x < panelLeftCol || x >= panelLeftCol + width) return null;
      const pos = scrollOffset + relative;
      if (pos >= view.length || !selectableAt(pos)) return null;
      return pos;
    };
    const onMouse = (kind: 'move' | 'click' | 'press', x: number, y: number): void => {
      if (kind === 'click') backdrop.addClick(x, y);
      if (hasActions && y === panelTopRow + actionLineOffset) {
        const actionIdx = actionIndexAtX(actions, x, panelLeftCol, inner);
        if (actionIdx === null || actions[actionIdx].disabled) return;
        if (selectedAction !== actionIdx) {
          selectedAction = actionIdx;
          render();
        }
        if (kind === 'click') choose(actions[actionIdx].value);
        return;
      }
      const pos = hitOption(x, y);
      if (pos === null) {
        if (kind === 'move' && selectedAction !== null) {
          selectedAction = null;
          render();
        }
        return;
      }
      if (selected !== pos || selectedAction !== null) {
        selected = pos;
        selectedAction = null;
        render();
      }
      if (kind === 'click') choose();
    };
    const onEvent = (event: InputEvent): void => {
      if (event.type === 'mouse') {
        if (event.kind === 'wheel-up') {
          move(-1);
          render();
        } else if (event.kind === 'wheel-down') {
          move(1);
          render();
        } else {
          onMouse(event.kind, event.x, event.y);
        }
        return;
      }
      if (event.type === 'key') {
        switch (event.name) {
          case 'up':
            move(-1);
            selectedAction = null;
            render();
            return;
          case 'down':
            move(1);
            selectedAction = null;
            render();
            return;
          case 'tab':
            if (hasActions) {
              selectedAction = selectedAction === null ? 0 : null;
              render();
            }
            return;
          case 'return':
            if (selectedAction !== null) choose(actions[selectedAction].value);
            else choose();
            return;
          case 'ctrl-c':
            cleanup();
            process.exit(0);
            return;
          case 'escape':
            if (searchable && query) {
              query = '';
              refilter();
              return;
            }
            cleanup();
            process.exit(0);
            return;
          case 'backspace':
            if (searchable) {
              query = query.slice(0, -1);
              refilter();
            }
            return;
          default:
            return;
        }
      }
      if (event.type === 'char' && searchable && query.length < 40) {
        query += cleanInputValue(event.char);
        refilter();
      }
    };
    const input = new RawInput(onEvent);
    const onResize = (): void => {
      recomputeLayout();
      syncBackdropExclude();
      prevLines = [];
      prevFooter = '';
      stdout.write('\x1B[2J');
      render();
    };
    const cleanup = (): void => {
      backdrop.stop();
      stdout.removeListener('resize', onResize);
      input.stop();
      leaveInteractiveScreen();
    };
    enterInteractiveScreen(true);
    render();
    backdrop.start();
    stdout.on('resize', onResize);
    input.start();
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
  const headerCount = headerLines.length;
  const lineCount = 3 + headerCount + (headerCount > 0 ? 1 : 0) + 2;
  let width = 0;
  let inner = 0;
  let panelTopRow = 0;
  let panelLeftCol = 0;
  let footerRow = 0;
  const recomputeLayout = (): void => {
    width = Math.max(50, Math.min(maxWidth(), 64));
    inner = width - 4;
    const rows = process.stdout.rows || 24;
    const columns = process.stdout.columns || 80;
    panelTopRow = Math.max(2, Math.floor((rows - lineCount) / 2) + 1);
    panelLeftCol = Math.max(1, Math.floor((columns - width) / 2) + 1);
    footerRow = Math.min(rows, panelTopRow + lineCount + 1);
  };
  recomputeLayout();
  return new Promise((resolve) => {
    let value = defaultValue;
    let prevLines: string[] = [];
    let prevFooter = '';
    const backdrop = new Backdrop();
    const syncBackdropExclude = (): void => {
      backdrop.setExclude({
        top: panelTopRow - 1,
        left: panelLeftCol - 2,
        width: width + 4,
        height: lineCount + 3,
      });
    };
    syncBackdropExclude();
    const render = (): void => {
      const shown = value || '';
      const clipped = truncatePlain(shown, Math.max(12, inner - 6));
      const inputContent = ` ${chalk.hex(THEME.text)('▏')} ${chalk.hex(THEME.text)(clipped)}${chalk.hex(THEME.primary)('▌')}`;
      const inputVisible = stripAnsi(inputContent).length;
      const inputRow = chalk.bgHex(THEME.element)(
        inputContent + ' '.repeat(Math.max(0, width - inputVisible))
      );
      const lines: string[] = [];
      lines.push(panelRow(width));
      lines.push(titleRow(width, question));
      lines.push(panelRow(width));
      for (const header of headerLines) {
        lines.push(panelRow(width, `   ${ui.muted(truncatePlain(stripAnsi(header), inner))}`));
      }
      if (headerCount > 0) lines.push(panelRow(width));
      lines.push(inputRow);
      lines.push(panelRow(width));
      const sameLength = prevLines.length === lines.length;
      lines.forEach((line, index) => {
        if (!sameLength || prevLines[index] !== line) {
          writeAt(panelTopRow + index, panelLeftCol, line);
        }
      });
      prevLines = lines;
      const footer = centerText(
        ui.muted(config.footer || 'type value   enter confirm   esc close'),
        width
      );
      if (footer !== prevFooter) {
        writeAt(footerRow, panelLeftCol, footer);
        prevFooter = footer;
      }
    };
    const onResize = (): void => {
      recomputeLayout();
      syncBackdropExclude();
      prevLines = [];
      prevFooter = '';
      stdout.write('\x1B[2J');
      render();
    };
    const cleanup = (): void => {
      backdrop.stop();
      stdout.removeListener('resize', onResize);
      input.stop();
      leaveInteractiveScreen();
    };
    const submit = (): void => {
      const output = cleanInputValue(value.trim() || defaultValue);
      cleanup();
      resolve(output);
    };
    const onEvent = (event: InputEvent): void => {
      if (event.type === 'key') {
        switch (event.name) {
          case 'ctrl-c':
          case 'escape':
            cleanup();
            process.exit(0);
            return;
          case 'return':
            submit();
            return;
          case 'backspace':
            value = value.slice(0, -1);
            render();
            return;
          case 'delete':
            value = '';
            render();
            return;
          default:
            return;
        }
      }
      if (event.type === 'char') {
        value += cleanInputValue(event.char);
        render();
      }
    };
    const input = new RawInput(onEvent);
    enterInteractiveScreen(false);
    render();
    backdrop.start();
    stdout.on('resize', onResize);
    input.start();
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
function renderActions(actions: SelectAction[], active: number | null): string {
  const rendered = actions
    .map((action, index) => {
      const label = stripAnsi(action.label);
      if (action.disabled) return ui.muted(label);
      if (active === index)
        return chalk.bgHex(THEME.primary).hex(THEME.background).bold(` ${label} `);
      return ui.text(label);
    })
    .join('   ');
  return `   ${rendered}`;
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
const BETA_SUFFIX = '[beta]';

function betaBadge(): string {
  return chalk.bgHex(THEME.warning).hex(THEME.background).bold(' beta ');
}

function splitBetaLabel(plain: string): { base: string; beta: boolean } {
  if (plain.endsWith(BETA_SUFFIX)) {
    return { base: plain.slice(0, -BETA_SUFFIX.length).trimEnd(), beta: true };
  }
  return { base: plain, beta: false };
}

function renderOption(
  option: SelectOption,
  isSelected: boolean,
  isDefault: boolean,
  width: number,
  inner: number
): string {
  const plain = truncatePlain(stripAnsi(option.label), Math.max(10, inner - 2));
  if (option.heading) {
    return panelRow(width, `   ${ui.accent.bold(plain)}`);
  }
  const { base, beta } = splitBetaLabel(plain);
  if (isSelected && !option.disabled) {
    return selectedRow(width, ` ${isDefault ? '●' : ' '} ${plain}`);
  }
  const badge = beta ? `  ${betaBadge()}` : '';
  if (option.disabled) {
    return panelRow(width, `   ${ui.muted(base)}${badge}`);
  }
  if (isDefault) {
    return panelRow(width, ` ${ui.primary('●')} ${ui.primary(base)}${badge}`);
  }
  return panelRow(width, `   ${ui.text(base)}${badge}`);
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
function writeAt(row: number, col: number, text: string): void {
  stdout.write(`\x1B[${row};${col}H${text}`);
}
function cleanInputValue(value: string): string {
  return value
    .replace(/\x1B\[<\d+;\d+;\d+[mM]/g, '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/(?:\d+;){2}\d+[mM]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}
