import chalk from 'chalk';
import { stripAnsi, ui } from './theme.js';

export function maxWidth(): number {
  return Math.min(process.stdout.columns || 80, 76);
}

function padRight(text: string, w: number): string {
  const fitted = fitAnsi(text, w);
  const visible = stripAnsi(fitted).length;
  if (visible >= w) return fitted;
  return fitted + ' '.repeat(w - visible);
}

function fitAnsi(text: string, width: number): string {
  if (stripAnsi(text).length <= width) return text;
  if (width <= 2) return '.'.repeat(Math.max(0, width));

  let out = '';
  let visible = 0;
  let i = 0;
  const limit = width - 2;

  while (i < text.length && visible < limit) {
    if (text[i] === '\x1B') {
      const match = text.slice(i).match(/^\x1B\[[0-9;]*[a-zA-Z]/);
      if (match) {
        out += match[0];
        i += match[0].length;
        continue;
      }
    }

    out += text[i];
    visible++;
    i++;
  }

  return out + '..' + '\x1B[0m';
}

function fitValue(value: string, width: number): string {
  if (value.length <= width) return value;

  const pathLike = value.includes('\\') || value.includes('/');
  if (pathLike) {
    const shortened = shortenPath(value, width);
    if (shortened.length <= width) return shortened;
  }

  if (width <= 3) return '.'.repeat(Math.max(0, width));
  return value.slice(0, width - 2) + '..';
}

function shortenPath(value: string, width: number): string {
  if (width <= 12) {
    return width <= 3 ? '.'.repeat(Math.max(0, width)) : value.slice(0, width - 2) + '..';
  }

  const separator = value.includes('\\') ? '\\' : '/';
  const parts = value.split(/[\\/]+/).filter(Boolean);
  const prefix = value.startsWith(separator) ? separator : '';
  const shortened = parts
    .map((part, index) => {
      const isLast = index === parts.length - 1;
      if (isLast) return part;
      if (/^[A-Za-z]:$/.test(part)) return part;
      return part.length > 5 ? part.slice(0, 3) + '..' : part;
    })
    .join(separator);

  const withPrefix = prefix + shortened;
  if (withPrefix.length <= width) return withPrefix;

  const last = parts.at(-1) || value;
  const first = parts
    .slice(0, -1)
    .map((part) => (/^[A-Za-z]:$/.test(part) ? part : part.slice(0, 3) + '..'));
  const compact = prefix + [...first, last].join(separator);
  if (compact.length <= width) return compact;

  const tailSpace = Math.max(8, Math.floor(width * 0.45));
  const headSpace = Math.max(0, width - tailSpace - 4);
  const middle =
    compact.slice(0, headSpace) + separator + '..' + separator + compact.slice(-tailSpace);
  return middle.length <= width ? middle : compact.slice(0, width - 2) + '..';
}

export function boxTop(w: number): string {
  const inner = w - 4;
  return '  ' + ui.border('╭─') + ui.border('─'.repeat(inner)) + ui.border('─╮');
}

export function panelTop(w: number): string {
  const inner = w - 4;
  return ui.border('╭─') + ui.border('─'.repeat(inner)) + ui.border('─╮');
}

export function boxBot(w: number): string {
  const inner = w - 4;
  return '  ' + ui.border('╰─') + ui.border('─'.repeat(inner)) + ui.border('─╯');
}

export function panelBot(w: number): string {
  const inner = w - 4;
  return ui.border('╰─') + ui.border('─'.repeat(inner)) + ui.border('─╯');
}

export function boxLine(w: number, text: string): string {
  const inner = w - 4;
  const padded = padRight(text, inner);
  return '  ' + ui.border('│ ') + padded + ui.border(' │');
}

export function panelLine(w: number, text: string): string {
  const inner = w - 4;
  const padded = padRight(text, inner);
  return ui.border('│ ') + padded + ui.border(' │');
}

export function boxSep(w: number): string {
  const inner = w - 4;
  return '  ' + ui.border('├─') + ui.border('─'.repeat(inner)) + ui.border('─┤');
}

export function panelSep(w: number): string {
  const inner = w - 4;
  return ui.border('├─') + ui.border('─'.repeat(inner)) + ui.border('─┤');
}

export function boxRow(w: number, label: string, value: string): string {
  const inner = w - 4;
  const labelPlain = stripAnsi(chalk.bold(label));
  const avail = Math.max(0, inner - labelPlain.length - 2);
  const fittedValue = fitValue(value, avail);
  const right = Math.max(0, inner - labelPlain.length - 2 - fittedValue.length);
  return (
    '  ' +
    ui.border('│ ') +
    chalk.bold(label) +
    ': ' +
    ui.primary(fittedValue) +
    ' '.repeat(right) +
    ui.border(' │')
  );
}
