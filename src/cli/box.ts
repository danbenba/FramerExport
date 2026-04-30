import chalk from 'chalk';

export function maxWidth(): number {
  return Math.min(process.stdout.columns || 80, 62);
}

const B = chalk.hex('#8B6914');
const G = chalk.hex('#C4953A');

function padRight(text: string, w: number): string {
  const visible = stripAnsi(text).length;
  if (visible >= w) return text;
  return text + ' '.repeat(w - visible);
}

function stripAnsi(s: string): string {
  return s.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

export function boxTop(w: number): string {
  const inner = w - 4;
  return '  ' + B('╔═') + B('═'.repeat(inner)) + B('═╗');
}

export function boxBot(w: number): string {
  const inner = w - 4;
  return '  ' + B('╚═') + B('═'.repeat(inner)) + B('═╝');
}

export function boxLine(w: number, text: string): string {
  const inner = w - 4;
  const padded = padRight(text, inner);
  return '  ' + B('║ ') + padded + B(' ║');
}

export function boxSep(w: number): string {
  const inner = w - 4;
  return '  ' + B('╠═') + B('═'.repeat(inner)) + B('═╣');
}

export function boxRow(w: number, label: string, value: string): string {
  const inner = w - 4;
  const labelPlain = stripAnsi(chalk.bold(label));
  const visible = labelPlain.length + 1 + value.length;
  if (visible > inner) {
    const avail = inner - labelPlain.length - 2;
    const truncated = value.length > avail ? value.slice(0, avail - 1) + '..' : value;
    return '  ' + G('║ ') + chalk.bold(label) + ': ' + chalk.yellow(truncated) + ' '.repeat(Math.max(0, inner - labelPlain.length - 1 - truncated.length)) + G(' ║');
  }
  const right = inner - labelPlain.length - 1 - value.length;
  return '  ' + G('║ ') + chalk.bold(label) + ': ' + chalk.yellow(value) + ' '.repeat(right) + G(' ║');
}
