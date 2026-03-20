import chalk from 'chalk';
import { showBanner } from './banner.js';

export function showHelp() {
  showBanner();

  console.log(chalk.white.bold('  USAGE\n'));
  console.log(`    ${chalk.cyan('npm run dev')}   ${chalk.gray('--')} ${chalk.yellow('<url>')} ${chalk.gray('[output-dir]')}`);
  console.log(`    ${chalk.cyan('npm start')}     ${chalk.gray('--')} ${chalk.yellow('<url>')} ${chalk.gray('[output-dir]')}`);
  console.log(`    ${chalk.cyan('node src/cli/index.js')} ${chalk.yellow('<url>')} ${chalk.gray('[output-dir]')}`);

  console.log('');
  console.log(chalk.white.bold('  OPTIONS\n'));

  const opts = [
    ['--setup', 'Launch the interactive setup assistant'],
    ['--help, -h', 'Show this help message'],
  ];

  for (const [flag, desc] of opts) {
    console.log(`    ${chalk.green(flag.padEnd(16))} ${chalk.white(desc)}`);
  }

  console.log('');
  console.log(chalk.white.bold('  OUTPUT STRUCTURE\n'));

  const tree = [
    ['index.html', 'Main page (rewritten to local paths)'],
    ['styles/', 'CSS files'],
    ['scripts/framer/', 'Framer JS runtime modules (pretty-printed)'],
    ['scripts/modules/', 'Component modules (pretty-printed)'],
    ['assets/images/', 'All images'],
    ['assets/fonts/', 'All fonts'],
    ['data/', 'CMS data, search index'],
    ['serve.cjs', 'Local HTTP server'],
  ];

  for (const [name, desc] of tree) {
    console.log(`    ${chalk.yellow(name.padEnd(22))} ${chalk.gray(desc)}`);
  }

  console.log('');
  console.log(chalk.white.bold('  EXAMPLES\n'));
  console.log(`    ${chalk.gray('$')} ${chalk.cyan('npm run dev')} ${chalk.gray('--')} ${chalk.yellow('https://mysite.framer.app')}`);
  console.log(`    ${chalk.gray('$')} ${chalk.cyan('npm run dev')} ${chalk.gray('--')} ${chalk.yellow('https://mysite.framer.app')} ${chalk.yellow('./my-export')}`);
  console.log(`    ${chalk.gray('$')} ${chalk.cyan('npm run dev')} ${chalk.gray('--')} ${chalk.green('--setup')}`);
  console.log('');
}
