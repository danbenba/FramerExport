#!/usr/bin/env node

import path from 'path';
import { URL } from 'url';
import { showHelp } from './help.js';
import { showBanner } from './banner.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  if (args.includes('--setup')) {
    const { runSetup } = await import('./setup.js');
    await runSetup();
    return;
  }

  if (!args.length) {
    showHelp();
    process.exit(0);
  }

  showBanner();

  const url = args[0];
  const out = args[1] || './framer-output';

  try {
    new URL(url);
  } catch {
    const chalk = (await import('chalk')).default;
    console.log(`  ${chalk.red('✗')} ${chalk.red.bold('Invalid URL:')} ${chalk.white(url)}`);
    console.log(`  ${chalk.gray('Expected format: https://yoursite.framer.app')}\n`);
    process.exit(1);
  }

  const { FramerExporter } = await import('../exporter/index.js');

  try {
    await new FramerExporter(url, path.resolve(out)).run();
  } catch (e) {
    const chalk = (await import('chalk')).default;
    console.log(`\n  ${chalk.red('✗')} ${chalk.red.bold('FAILED:')} ${chalk.white(e.message)}`);
    console.log(chalk.gray(e.stack));
    process.exit(1);
  }
}

main();
