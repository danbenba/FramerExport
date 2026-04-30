import chalk from 'chalk';
import type { CookingSpinner } from '../cli/cooking.js';

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
  (s) => chalk.hex('#D4A017')(s),
  (s) => chalk.hex('#DAA520')(s),
  (s) => chalk.hex('#C8A951')(s),
  (s) => chalk.hex('#E0B040')(s),
  (s) => chalk.hex('#daa520')(s),
  (s) => chalk.hex('#c4953a')(s),
  (s) => chalk.hex('#e8c33a')(s),
  (s) => chalk.hex('#dab660')(s),
  (s) => chalk.hex('#b8960a')(s),
  (s) => chalk.hex('#d4a76a')(s),
  (s) => chalk.hex('#e0a030')(s),
  (s) => chalk.hex('#c0a060')(s),
];
let _li = 0;

export const log = (m: string): void => {
  _li++;
  const c = LOG_PALETTE[_li % LOG_PALETTE.length];
  output(`${chalk.hex('#6d6d6d')(`[${T()}]`)} ${chalk.hex('#B8960A')('[LOG]')} ${c(trunc(m, 120))}`);
};

const INFO_PALETTE: Array<(s: string) => string> = [
  (s) => chalk.hex('#4DB8B0')(s),
  (s) => chalk.hex('#5CC0BA')(s),
  (s) => chalk.hex('#3AA89E')(s),
  (s) => chalk.hex('#6BC4BE')(s),
  (s) => chalk.hex('#48B5AD')(s),
  (s) => chalk.hex('#52BAB4')(s),
];
let _ii = 0;

export const info = (m: string): void => {
  _ii++;
  const c = INFO_PALETTE[_ii % INFO_PALETTE.length];
  output(`${chalk.hex('#6d6d6d')(`[${T()}]`)} ${chalk.hex('#3AA89E').bold('[INFO]')} ${c(trunc(m, 120))}`);
};

export const warn = (m: string): void => {
  const colors: Array<(s: string) => string> = [
    (s) => chalk.hex('#E8833A')(s),
    (s) => chalk.hex('#F09040')(s),
    (s) => chalk.hex('#CC7722')(s),
    (s) => chalk.hex('#E87D2A')(s),
  ];
  const c = colors[Math.floor(Math.random() * colors.length)];
  const line = `${chalk.hex('#7a7a7a')(`[${T()}]`)} ${chalk.hex('#E8833A').bold('[WARN]')} ${c(trunc(m, 120))}`;
  if (_cooking) _cooking.log(line);
  else console.warn(line);
};

export const success = (m: string): void => {
  const colors: Array<(s: string) => string> = [
    (s) => chalk.hex('#4CAF50')(s),
    (s) => chalk.hex('#66BB6A')(s),
    (s) => chalk.hex('#43A047')(s),
    (s) => chalk.hex('#81C784')(s),
    (s) => chalk.hex('#2E7D32')(s),
  ];
  const c = colors[Math.floor(Math.random() * colors.length)];
  output(`${chalk.hex('#6d6d6d')(`[${T()}]`)} ${chalk.greenBright('[OK]')} ${c(trunc(m, 120))}`);
};

export const error = (m: string): void => {
  const colors: Array<(s: string) => string> = [
    (s) => chalk.hex('#EF5350')(s),
    (s) => chalk.hex('#E53935')(s),
    (s) => chalk.hex('#F44336')(s),
    (s) => chalk.hex('#D32F2F')(s),
  ];
  const c = colors[Math.floor(Math.random() * colors.length)];
  const line = `${chalk.hex('#7a7a7a')(`[${T()}]`)} ${chalk.redBright('[ERROR]')} ${c(trunc(m, 120))}`;
  if (_cooking) _cooking.log(line);
  else console.error(line);
};
