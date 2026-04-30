import chalk from 'chalk';
import { showBanner } from './banner.js';

export function showHelp(): void {
  showBanner();

  console.log(chalk.white.bold('  USAGE\n'));
    console.log(`    ${chalk.hex('#D4A017')('framer-export')} ${chalk.yellow('<url>')} ${chalk.gray('[output-dir]')}`);
    console.log(`    ${chalk.hex('#D4A017')('fexport')}         ${chalk.yellow('<url>')} ${chalk.gray('[output-dir]')}`);

  console.log('');
  console.log(chalk.white.bold('  OPTIONS\n'));

  const opts: Array<[string, string]> = [
    ['--setup', 'Launch the interactive setup assistant'],
    ['--platform <p>', 'Force platform: framer, webflow, wix'],
    ['--subpages', 'Crawl and export sub-pages'],
    ['--legacy-mode', 'Use text input instead of arrow selection'],
    ['--help, -h', 'Show this help message'],
  ];

  for (const [flag, desc] of opts) {
    console.log(`    ${chalk.green(flag.padEnd(18))} ${chalk.white(desc)}`);
  }

  console.log('');
  console.log(chalk.white.bold('  SUPPORTED PLATFORMS\n'));

  const platforms: Array<[string, string]> = [
    ['Framer', 'Auto-detected via .framer.app / .framer.website URLs'],
    ['Webflow', 'Auto-detected via .webflow.io URLs'],
    ['Wix', 'Auto-detected via .wixsite.com URLs + HTML analysis'],
  ];

  for (const [name, desc] of platforms) {
    console.log(`    ${chalk.hex('#D4A017')(name.padEnd(12))} ${chalk.gray(desc)}`);
  }

  console.log('');
  console.log(chalk.white.bold('  EXAMPLES\n'));
    console.log(`    ${chalk.gray('$')} ${chalk.hex('#D4A017')('framer-export')} ${chalk.yellow('https://mysite.framer.app')}`);
    console.log(`    ${chalk.gray('$')} ${chalk.hex('#D4A017')('framer-export')} ${chalk.yellow('https://mysite.webflow.io')}`);
    console.log(`    ${chalk.gray('$')} ${chalk.hex('#D4A017')('framer-export')} ${chalk.yellow('https://user.wixsite.com/my-site')}`);
    console.log(`    ${chalk.gray('$')} ${chalk.hex('#D4A017')('framer-export')} ${chalk.green('--platform webflow')} ${chalk.yellow('https://custom.com')}`);
    console.log(`    ${chalk.gray('$')} ${chalk.hex('#D4A017')('framer-export')} ${chalk.green('--subpages')} ${chalk.yellow('https://mysite.com')}`);
    console.log(`    ${chalk.gray('$')} ${chalk.hex('#D4A017')('framer-export')} ${chalk.green('--setup')}`);
    console.log(`    ${chalk.gray('$')} ${chalk.hex('#D4A017')('framer-export')} ${chalk.green('--setup --legacy-mode')}`);
  console.log('');
}
