import readline from 'readline';
import { stdin, stdout } from 'process';
import chalk from 'chalk';

export interface SelectOption {
  label: string;
  value: string;
}

export async function select(question: string, options: SelectOption[], defaultIndex: number = 0): Promise<string> {
  return new Promise((resolve) => {
    let selected: number = defaultIndex;

    const render = (initial: boolean = false): void => {
      if (!initial) {
        stdout.write(`\x1B[${options.length + 1}A`);
        stdout.write('\x1B[J');
      }
      console.log(`  ${chalk.cyan('?')} ${chalk.white.bold(question)}`);
      for (let i = 0; i < options.length; i++) {
        if (i === selected) {
          console.log(`    ${chalk.cyan('>')} ${chalk.white.bold(options[i].label)}`);
        } else {
          console.log(`      ${chalk.gray(options[i].label)}`);
        }
      }
    };

    render(true);

    readline.emitKeypressEvents(stdin);
    const wasTTY: boolean = stdin.isTTY || false;
    if (wasTTY) stdin.setRawMode(true);

    const onKeypress = (_str: string | undefined, key: readline.Key): void => {
      if (!key) return;

      if (key.name === 'up' && selected > 0) {
        selected--;
        render();
      } else if (key.name === 'down' && selected < options.length - 1) {
        selected++;
        render();
      } else if (key.name === 'return') {
        if (wasTTY) stdin.setRawMode(false);
        stdin.removeListener('keypress', onKeypress);
        stdin.pause();

        stdout.write(`\x1B[${options.length + 1}A`);
        stdout.write('\x1B[J');
        console.log(`  ${chalk.green('✓')} ${chalk.white.bold(question)} ${chalk.cyan(options[selected].label)}\n`);

        resolve(options[selected].value);
      } else if ((key.ctrl && key.name === 'c') || key.name === 'escape') {
        if (wasTTY) stdin.setRawMode(false);
        stdin.removeListener('keypress', onKeypress);
        process.exit(0);
      }
    };

    stdin.resume();
    stdin.on('keypress', onKeypress);
  });
}
