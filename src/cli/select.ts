import readline from 'node:readline';
import { stdin, stdout } from 'node:process';
import chalk from 'chalk';

export interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

function stripAnsi(s: string): string {
  return s.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
}

export async function select(
  question: string,
  options: SelectOption[],
  defaultIndex: number = 0
): Promise<string> {
  const isTTY = stdin.isTTY && stdout.isTTY;

  if (!isTTY) {
    return fallbackPrompt(question, options, defaultIndex);
  }

  return arrowSelect(question, options, defaultIndex);
}

async function arrowSelect(
  question: string,
  options: SelectOption[],
  defaultIndex: number
): Promise<string> {
  return new Promise((resolve) => {
    const firstEnabled: number = options.findIndex((option) => !option.disabled);
    let selected: number = options[defaultIndex]?.disabled ? firstEnabled : defaultIndex;
    if (selected < 0) selected = 0;

    const move = (direction: -1 | 1): void => {
      let next = selected + direction;
      while (next >= 0 && next < options.length) {
        if (!options[next].disabled) {
          selected = next;
          return;
        }
        next += direction;
      }
    };

    const render = (initial: boolean = false): void => {
      if (!initial) {
        stdout.write(`\x1B[${options.length + 1}A`);
        stdout.write('\x1B[J');
      }
      console.log(`  ${chalk.hex('#D4A017')('?')} ${chalk.white.bold(question)}`);
      for (let i = 0; i < options.length; i++) {
        if (options[i].disabled) {
          console.log(`      ${chalk.gray(stripAnsi(options[i].label))}`);
        } else if (i === selected) {
          console.log(`    ${chalk.hex('#D4A017')('>')} ${chalk.white.bold(options[i].label)}`);
        } else {
          console.log(`      ${chalk.gray(options[i].label)}`);
        }
      }
    };

    render(true);

    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);

    const onKeypress = (_str: string | undefined, key: readline.Key): void => {
      if (!key) return;

      if (key.name === 'up' && selected > 0) {
        move(-1);
        render();
      } else if (key.name === 'down' && selected < options.length - 1) {
        move(1);
        render();
      } else if (key.name === 'return') {
        stdin.setRawMode(false);
        stdin.removeListener('keypress', onKeypress);
        stdin.pause();

        stdout.write(`\x1B[${options.length + 1}A`);
        stdout.write('\x1B[J');
        console.log(
          `  ${chalk.green('✓')} ${chalk.white.bold(question)} ${chalk.hex('#D4A017')(stripAnsi(options[selected].label))}\n`
        );

        resolve(options[selected].value);
      } else if ((key.ctrl && key.name === 'c') || key.name === 'escape') {
        stdin.setRawMode(false);
        stdin.removeListener('keypress', onKeypress);
        process.exit(0);
      }
    };

    stdin.resume();
    stdin.on('keypress', onKeypress);
  });
}

async function fallbackPrompt(
  question: string,
  options: SelectOption[],
  defaultIndex: number
): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const firstEnabled: number = options.findIndex((option) => !option.disabled);
    const enabledDefault: number = options[defaultIndex]?.disabled ? firstEnabled : defaultIndex;

    console.log(`  ${chalk.hex('#D4A017')('?')} ${chalk.white.bold(question)}\n`);
    for (let i = 0; i < options.length; i++) {
      const marker = i === enabledDefault ? chalk.green(' ★') : '  ';
      const label = options[i].disabled
        ? chalk.gray(stripAnsi(options[i].label))
        : chalk.white(options[i].label);
      console.log(`   ${chalk.gray(`[${i + 1}]`)}${marker} ${label}`);
    }
    console.log('');
    const def = String(enabledDefault + 1);

    const ask = (): void => {
      rl.question(
        `  ${chalk.hex('#D4A017')('>')} ${chalk.gray(`Choose [1-${options.length}] (${def})`)}: `,
        (answer) => {
          const trimmed = answer.trim();
          if (!trimmed) {
            rl.close();
            const label = stripAnsi(options[enabledDefault].label);
            console.log(`  ${chalk.green('✓')} ${chalk.hex('#D4A017')(label)}\n`);
            resolve(options[enabledDefault].value);
            return;
          }
          const idx = parseInt(trimmed, 10);
          if (idx >= 1 && idx <= options.length && !options[idx - 1].disabled) {
            rl.close();
            const label = stripAnsi(options[idx - 1].label);
            console.log(`  ${chalk.green('✓')} ${chalk.hex('#D4A017')(label)}\n`);
            resolve(options[idx - 1].value);
          } else if (idx >= 1 && idx <= options.length && options[idx - 1].disabled) {
            console.log(`  ${chalk.red('✗')} Option unavailable for now\n`);
            ask();
          } else {
            console.log(`  ${chalk.red('✗')} Enter 1-${options.length}\n`);
            ask();
          }
        }
      );
    };
    ask();
  });
}
