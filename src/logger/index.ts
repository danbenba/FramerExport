import chalk from 'chalk';
import type { CookingSpinner } from '../cli/cooking.js';

let _cooking: CookingSpinner | null = null;

export function setCooking(spinner: CookingSpinner | null): void {
  _cooking = spinner;
}

const T = (): string => new Date().toISOString().slice(11, 19);

function output(line: string): void {
  if (_cooking) {
    _cooking.log(line);
  } else {
    console.log(line);
  }
}

export const log = (m: string): void =>
  output(`${chalk.gray(`[${T()}]`)} ${chalk.cyan('[LOG]')} ${m}`);

export const info = (m: string): void =>
  output(`${chalk.gray(`[${T()}]`)} ${chalk.blue('[INFO]')} ${chalk.bold(m)}`);

export const warn = (m: string): void => {
  const line = `${chalk.gray(`[${T()}]`)} ${chalk.yellow('[WARN]')} ${chalk.yellow(m)}`;
  if (_cooking) _cooking.log(line);
  else console.warn(line);
};

export const success = (m: string): void =>
  output(`${chalk.gray(`[${T()}]`)} ${chalk.green('[OK]')} ${chalk.green(m)}`);

export const error = (m: string): void => {
  const line = `${chalk.gray(`[${T()}]`)} ${chalk.red('[ERROR]')} ${chalk.red.bold(m)}`;
  if (_cooking) _cooking.log(line);
  else console.error(line);
};
