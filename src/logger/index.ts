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
export type LogLevel = 'log' | 'info' | 'warn' | 'ok' | 'error';
export interface LogRecord {
  time: string;
  level: LogLevel;
  message: string;
}
export type LogListener = (record: LogRecord) => void;
const _history: LogRecord[] = [];
const _listeners = new Set<LogListener>();
const HISTORY_LIMIT = 5000;
export function onLog(listener: LogListener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}
export function getLogHistory(): readonly LogRecord[] {
  return _history;
}
export function clearLogHistory(): void {
  _history.length = 0;
}
function record(level: LogLevel, message: string): LogRecord {
  const entry: LogRecord = { time: T(), level, message };
  _history.push(entry);
  if (_history.length > HISTORY_LIMIT) _history.shift();
  for (const listener of _listeners) listener(entry);
  return entry;
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
  const { time } = record('log', m);
  _li++;
  const c = LOG_PALETTE[_li % LOG_PALETTE.length];
  output(
    `${chalk.hex(THEME.muted)(`[${time}]`)} ${chalk.hex(THEME.primary)('[log]')} ${c(trunc(m, 120))}`
  );
};
const INFO_PALETTE: Array<(s: string) => string> = [
  (s) => chalk.hex(THEME.info)(s),
  (s) => chalk.hex(THEME.secondary)(s),
  (s) => chalk.hex(THEME.primarySoft)(s),
];
let _ii = 0;
export const info = (m: string): void => {
  const { time } = record('info', m);
  _ii++;
  const c = INFO_PALETTE[_ii % INFO_PALETTE.length];
  output(
    `${chalk.hex(THEME.muted)(`[${time}]`)} ${chalk.hex(THEME.info).bold('[info]')} ${c(trunc(m, 120))}`
  );
};
export const warn = (m: string): void => {
  const { time } = record('warn', m);
  const line = `${chalk.hex(THEME.muted)(`[${time}]`)} ${chalk.hex(THEME.warning).bold('[warn]')} ${chalk.hex(THEME.warning)(trunc(m, 120))}`;
  if (_cooking) _cooking.log(line);
  else console.warn(line);
};
export const success = (m: string): void => {
  const { time } = record('ok', m);
  output(
    `${chalk.hex(THEME.muted)(`[${time}]`)} ${chalk.hex(THEME.success)('[ok]')} ${chalk.hex(THEME.success)(trunc(m, 120))}`
  );
};
export const error = (m: string): void => {
  const { time } = record('error', m);
  const line = `${chalk.hex(THEME.muted)(`[${time}]`)} ${chalk.hex(THEME.error)('[error]')} ${chalk.hex(THEME.error)(trunc(m, 120))}`;
  if (_cooking) _cooking.log(line);
  else console.error(line);
};
