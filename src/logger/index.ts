import chalk from 'chalk';
import type { CookingSpinner } from '../cli/cooking.js';
import { THEME } from '../cli/theme.js';

let _cooking: CookingSpinner | null = null;

export function setCooking(spinner: CookingSpinner | null): void {
  _cooking = spinner;
}

const T = (): string => new Date().toISOString().slice(11, 19);

function trunc(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 2) + '..';
}

function output(line: string): void {
  if (_cooking) _cooking.log(line);
  else console.log(line);
}

const LOG_PALETTE: Array<(s: string) => string> = [
  (s) => chalk.hex(THEME.primary)(s),
  (s) => chalk.hex(THEME.primarySoft)(s),
  (s) => chalk.hex(THEME.secondary)(s),
  (s) => chalk.hex(THEME.accent)(s),
  (s) => chalk.hex(THEME.info)(s),
  (s) => chalk.hex(THEME.text)(s),
];
let _li = 0;

export const log = (m: string): void => {
  _li++;
  const c = LOG_PALETTE[_li % LOG_PALETTE.length];
  output(
    `${chalk.hex(THEME.muted)(`[${T()}]`)} ${chalk.hex(THEME.primary)('[log]')} ${c(trunc(m, 120))}`
  );
};

const INFO_PALETTE: Array<(s: string) => string> = [
  (s) => chalk.hex(THEME.info)(s),
  (s) => chalk.hex(THEME.secondary)(s),
  (s) => chalk.hex(THEME.primarySoft)(s),
];
let _ii = 0;

export const info = (m: string): void => {
  _ii++;
  const c = INFO_PALETTE[_ii % INFO_PALETTE.length];
  output(
    `${chalk.hex(THEME.muted)(`[${T()}]`)} ${chalk.hex(THEME.info).bold('[info]')} ${c(trunc(m, 120))}`
  );
};

export const warn = (m: string): void => {
  const colors: Array<(s: string) => string> = [
    (s) => chalk.hex(THEME.warning)(s),
    (s) => chalk.hex(THEME.primary)(s),
  ];
  const c = colors[Math.floor(Math.random() * colors.length)];
  const line = `${chalk.hex(THEME.muted)(`[${T()}]`)} ${chalk.hex(THEME.warning).bold('[warn]')} ${c(trunc(m, 120))}`;
  if (_cooking) _cooking.log(line);
  else console.warn(line);
};

export const success = (m: string): void => {
  const colors: Array<(s: string) => string> = [
    (s) => chalk.hex(THEME.success)(s),
    (s) => chalk.hex(THEME.info)(s),
  ];
  const c = colors[Math.floor(Math.random() * colors.length)];
  output(
    `${chalk.hex(THEME.muted)(`[${T()}]`)} ${chalk.hex(THEME.success)('[ok]')} ${c(trunc(m, 120))}`
  );
};

export const error = (m: string): void => {
  const colors: Array<(s: string) => string> = [(s) => chalk.hex(THEME.error)(s)];
  const c = colors[Math.floor(Math.random() * colors.length)];
  const line = `${chalk.hex(THEME.muted)(`[${T()}]`)} ${chalk.hex(THEME.error)('[error]')} ${c(trunc(m, 120))}`;
  if (_cooking) _cooking.log(line);
  else console.error(line);
};
