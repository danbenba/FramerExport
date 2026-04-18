import chalk from 'chalk';
import { showBanner } from './banner.js';

export function showHelp(): void {
  showBanner();

  console.log(chalk.white.bold('  USAGE\n'));
  console.log(`    ${chalk.cyan('npm run dev')}   ${chalk.gray('--')} ${chalk.yellow('<url>')} ${chalk.gray('[output-dir]')}`);
  console.log(`    ${chalk.cyan('npm start')}     ${chalk.gray('--')} ${chalk.yellow('<url>')} ${chalk.gray('[output-dir]')}`);
  console.log(`    ${chalk.cyan('npx tsx src/cli/index.ts')} ${chalk.yellow('<url>')} ${chalk.gray('[output-dir]')}`);

  console.log('');
  console.log(chalk.white.bold('  OPTIONS\n'));

  const opts: Array<[string, string]> = [
    ['--setup', 'Launch the interactive setup assistant'],
    ['--platform <p>', 'Force platform: framer, webflow, wix'],
    ['--help, -h', 'Show this help message'],
  ];

  for (const [flag, desc] of opts) {
    console.log(`    ${chalk.green(flag.padEnd(18))} ${chalk.white(desc)}`);
  }

  console.log('');
  console.log(chalk.white.bold('  SUPPORTED PLATFORMS\n'));

  const platforms: Array<[string, string]> = [
    ['Framer', 'Auto-detected via .framer.app URLs'],
    ['Webflow', 'Auto-detected via .webflow.io URLs'],
    ['Wix', 'Auto-detected via .wixsite.com URLs'],
  ];

  for (const [name, desc] of platforms) {
    console.log(`    ${chalk.magenta(name.padEnd(12))} ${chalk.gray(desc)}`);
  }

  console.log('');
  console.log(chalk.white.bold('  OUTPUT STRUCTURE\n'));

  const tree: Array<[string, string]> = [
    ['index.html', 'Main page (rewritten to local paths)'],
    ['styles/', 'CSS files'],
    ['scripts/vendor/', 'Platform JS modules (pretty-printed)'],
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
  console.log(`    ${chalk.gray('$')} ${chalk.cyan('npm run dev')} ${chalk.gray('--')} ${chalk.yellow('https://mysite.webflow.io')}`);
  console.log(`    ${chalk.gray('$')} ${chalk.cyan('npm run dev')} ${chalk.gray('--')} ${chalk.yellow('https://user.wixsite.com/my-site')}`);
  console.log(`    ${chalk.gray('$')} ${chalk.cyan('npm run dev')} ${chalk.gray('--')} ${chalk.green('--platform webflow')} ${chalk.yellow('https://custom-domain.com')}`);
  console.log(`    ${chalk.gray('$')} ${chalk.cyan('npm run dev')} ${chalk.gray('--')} ${chalk.green('--setup')}`);
  console.log('');
}
