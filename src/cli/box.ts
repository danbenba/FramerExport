import chalk from 'chalk';
import { ui } from './theme.js';
import { fitText, plainText, textWidth } from './terminal-screen.js';

function boundedWidth(width: number): number {
  return Math.max(0, Number.isFinite(width) ? Math.floor(width) : 0);
}

function columns(): number {
  return Math.max(1, Math.floor(process.stdout.columns || 80));
}

export function maxWidth(): number {
  const available = columns();
  return Math.min(76, Math.max(1, available - (available >= 6 ? 2 : 0)));
}

function padRight(text: string, width: number): string {
  const fitted = fitAnsi(text, width);
  return fitted + ' '.repeat(Math.max(0, width - textWidth(fitted)));
}

export function fitAnsi(text: string, width: number): string {
  width = boundedWidth(width);
  const tokens = text
    .split(/(\x1b\[[0-9;]*m)/g)
    .map((token) => (/^\x1b\[[0-9;]*m$/.test(token) ? token : plainText(token)));
  const clean = tokens.join('');
  if (textWidth(clean) <= width) return clean;
  if (width <= 2) return '.'.repeat(width);
  const limit = width - 2;
  let output = '',
    used = 0;
  for (const token of tokens) {
    if (/^\x1b\[[0-9;]*m$/.test(token)) {
      output += token;
      continue;
    }
    const fitted = fitText(token, limit - used, false);
    output += fitted;
    used += textWidth(fitted);
    if (fitted !== token || used >= limit) break;
  }
  return output + '..' + '\x1b[0m';
}

function fitValue(value: string, width: number): string {
  if (textWidth(value) <= width) return value;
  if (value.includes('\\') || value.includes('/')) return shortenPath(value, width);
  if (width <= 3) return '.'.repeat(Math.max(0, width));
  return fitText(value, width - 2, false) + '..';
}

function tail(value: string, width: number): string {
  const segments = Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(plainText(value)),
    (part) => part.segment
  );
  let result = '';
  for (const segment of segments.reverse()) {
    if (textWidth(segment + result) > width) break;
    result = segment + result;
  }
  return result;
}

export function shortenPath(value: string, width: number): string {
  width = boundedWidth(width);
  value = plainText(value);
  if (width <= 12) {
    return width <= 3 ? '.'.repeat(width) : fitText(value, width - 2, false) + '..';
  }
  const separator = value.includes('\\') ? '\\' : '/';
  const parts = value.split(/[\\/]+/).filter(Boolean);
  const prefix = value.startsWith(separator) ? separator : '';
  const shortened = parts
    .map((part, index) => {
      if (index === parts.length - 1 || /^[A-Za-z]:$/.test(part)) return part;
      return textWidth(part) > 5 ? fitText(part, 3, false) + '..' : part;
    })
    .join(separator);
  const withPrefix = prefix + shortened;
  if (textWidth(withPrefix) <= width) return withPrefix;
  const last = parts.at(-1) || value;
  const first = parts
    .slice(0, -1)
    .map((part) => (/^[A-Za-z]:$/.test(part) ? part : fitText(part, 3, false) + '..'));
  const compact = prefix + [...first, last].join(separator);
  if (textWidth(compact) <= width) return compact;
  const tailSpace = Math.max(8, Math.floor(width * 0.45));
  const headSpace = Math.max(0, width - tailSpace - 4);
  const middle =
    fitText(compact, headSpace, false) + separator + '..' + separator + tail(compact, tailSpace);
  return textWidth(middle) <= width ? middle : fitText(compact, width - 2, false) + '..';
}

function frame(width: number, indented: boolean): { width: number; prefix: string } {
  const available = columns();
  const indent = indented && available >= 6 ? 2 : 0;
  return { width: Math.min(boundedWidth(width), available - indent), prefix: ' '.repeat(indent) };
}

function border(width: number, indented: boolean, left: string, right: string): string {
  const layout = frame(width, indented);
  if (!layout.width) return '';
  return (
    layout.prefix +
    ui.border(layout.width === 1 ? left : left + '─'.repeat(layout.width - 2) + right)
  );
}

function line(width: number, text: string, indented: boolean): string {
  const layout = frame(width, indented);
  if (!layout.width) return '';
  if (layout.width === 1) return layout.prefix + ui.border('│');
  const spacing = layout.width >= 4 ? ' ' : '';
  const inner = Math.max(0, layout.width - 2 - spacing.length * 2);
  return (
    layout.prefix + ui.border('│' + spacing) + padRight(text, inner) + ui.border(spacing + '│')
  );
}

export function boxTop(width: number): string {
  return border(width, true, '╭', '╮');
}
export function panelTop(width: number): string {
  return border(width, false, '╭', '╮');
}
export function boxBot(width: number): string {
  return border(width, true, '╰', '╯');
}
export function panelBot(width: number): string {
  return border(width, false, '╰', '╯');
}
export function boxLine(width: number, text: string): string {
  return line(width, text, true);
}
export function panelLine(width: number, text: string): string {
  return line(width, text, false);
}
export function boxSep(width: number): string {
  return border(width, true, '├', '┤');
}
export function panelSep(width: number): string {
  return border(width, false, '├', '┤');
}

export function boxRow(width: number, label: string, value: string): string {
  const inner = Math.max(0, frame(width, true).width - 4);
  const available = Math.max(0, inner - textWidth(label) - 2);
  return boxLine(width, chalk.bold(label) + ': ' + ui.primary(fitValue(value, available)));
}
