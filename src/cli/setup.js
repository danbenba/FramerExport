import readline from 'readline/promises';
import { stdin, stdout } from 'process';
import path from 'path';
import { URL } from 'url';
import chalk from 'chalk';
import { showBanner } from './banner.js';
import { FramerExporter } from '../exporter/index.js';

function line(label, value) {
  console.log(`  ${chalk.magenta('│')} ${chalk.bold(label.padEnd(14))} ${chalk.yellow(value)}`);
}

export async function runSetup() {
  showBanner();

  console.log(chalk.bold.white('  Welcome to the Framer Export setup assistant.\n'));
  console.log(chalk.gray('  This wizard will guide you through the export configuration.\n'));

  const rl = readline.createInterface({ input: stdin, output: stdout });

  const ask = async (question, defaultVal) => {
    const suffix = defaultVal ? chalk.gray(` (${defaultVal})`) : '';
    const prompt = `  ${chalk.cyan('?')} ${chalk.white.bold(question)}${suffix} ${chalk.gray('>')} `;
    const answer = await rl.question(prompt);
    return answer.trim() || defaultVal || '';
  };

  console.log(chalk.magenta('  ┌─────────────────────────────────────────────┐'));
  console.log(chalk.magenta('  │') + chalk.bold.white('  Step 1 : Site URL                           ') + chalk.magenta('│'));
  console.log(chalk.magenta('  └─────────────────────────────────────────────┘'));
  console.log('');

  let siteUrl = '';
  while (!siteUrl) {
    const input = await ask('Enter the site URL');
    try {
      new URL(input);
      siteUrl = input;
    } catch {
      console.log(`  ${chalk.red('✗')} ${chalk.red('Invalid URL. Please enter a valid URL (https://...)')}\n`);
    }
  }
  console.log(`  ${chalk.green('✓')} ${chalk.green('URL set:')} ${chalk.underline(siteUrl)}\n`);

  console.log(chalk.magenta('  ┌─────────────────────────────────────────────┐'));
  console.log(chalk.magenta('  │') + chalk.bold.white('  Step 2 : Output Directory                   ') + chalk.magenta('│'));
  console.log(chalk.magenta('  └─────────────────────────────────────────────┘'));
  console.log('');

  const outDir = await ask('Output directory', './framer-output');
  console.log(`  ${chalk.green('✓')} ${chalk.green('Output:')} ${chalk.yellow(outDir)}\n`);

  console.log(chalk.magenta('  ┌─────────────────────────────────────────────┐'));
  console.log(chalk.magenta('  │') + chalk.bold.white('  Step 3 : Options                            ') + chalk.magenta('│'));
  console.log(chalk.magenta('  └─────────────────────────────────────────────┘'));
  console.log('');

  const prettyAnswer = await ask('Pretty-print JS files? (y/n)', 'y');
  const prettyPrint = prettyAnswer.toLowerCase().startsWith('y');
  console.log(`  ${chalk.green('✓')} ${chalk.green('Pretty-print:')} ${prettyPrint ? chalk.green('yes') : chalk.red('no')}\n`);

  const concurrencyAnswer = await ask('Download concurrency', '12');
  const concurrency = parseInt(concurrencyAnswer, 10) || 12;
  console.log(`  ${chalk.green('✓')} ${chalk.green('Concurrency:')} ${chalk.yellow(String(concurrency))}\n`);

  console.log('');
  console.log(chalk.magenta('  ┌─────────────────────────────────────────────┐'));
  console.log(chalk.magenta('  │') + chalk.bold.white('  Summary                                     ') + chalk.magenta('│'));
  console.log(chalk.magenta('  ├─────────────────────────────────────────────┤'));
  line('URL', siteUrl);
  line('Output', path.resolve(outDir));
  line('Pretty-print', prettyPrint ? 'yes' : 'no');
  line('Concurrency', String(concurrency));
  console.log(chalk.magenta('  └─────────────────────────────────────────────┘'));
  console.log('');

  const confirm = await ask('Start export? (y/n)', 'y');

  if (!confirm.toLowerCase().startsWith('y')) {
    console.log(`\n  ${chalk.yellow('Export cancelled.')}\n`);
    rl.close();
    return;
  }

  rl.close();

  console.log('');

  const { CFG } = await import('../config/index.js');
  CFG.concurrency = concurrency;

  const exporter = new FramerExporter(siteUrl, path.resolve(outDir));
  exporter.prettyPrint = prettyPrint;
  await exporter.run();
}
