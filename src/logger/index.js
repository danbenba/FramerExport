import chalk from 'chalk';

const T = () => new Date().toISOString().slice(11, 19);

export const log = (m) =>
  console.log(`${chalk.gray(`[${T()}]`)} ${chalk.cyan('[LOG]')} ${m}`);

export const info = (m) =>
  console.log(`${chalk.gray(`[${T()}]`)} ${chalk.blue('[INFO]')} ${chalk.bold(m)}`);

export const warn = (m) =>
  console.warn(`${chalk.gray(`[${T()}]`)} ${chalk.yellow('[WARN]')} ${chalk.yellow(m)}`);

export const success = (m) =>
  console.log(`${chalk.gray(`[${T()}]`)} ${chalk.green('[SUCCESS]')} ${chalk.green(m)}`);

export const error = (m) =>
  console.error(`${chalk.gray(`[${T()}]`)} ${chalk.red('[ERROR]')} ${chalk.red.bold(m)}`);
