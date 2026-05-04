import chalk from 'chalk';
import { stripAnsi, ui } from './theme.js';

export function maxWidth(): number {
  return Math.min(process.stdout.columns || 80, 76);
}

function padRight(text: string, w: number): string {
  const visible = stripAnsi(text).length;
  if (visible >= w) return text;
  return text + ' '.repeat(w - visible);
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
  const visible = labelPlain.length + 1 + value.length;
  if (visible > inner) {
    const avail = inner - labelPlain.length - 2;
    const truncated = value.length > avail ? value.slice(0, avail - 1) + '..' : value;
    return (
      '  ' +
      ui.border('│ ') +
      chalk.bold(label) +
      ': ' +
      ui.primary(truncated) +
      ' '.repeat(Math.max(0, inner - labelPlain.length - 1 - truncated.length)) +
      ui.border(' │')
    );
  }
  const right = inner - labelPlain.length - 1 - value.length;
  return (
    '  ' +
    ui.border('│ ') +
    chalk.bold(label) +
    ': ' +
    ui.primary(value) +
    ' '.repeat(right) +
    ui.border(' │')
  );
}
