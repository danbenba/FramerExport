import chalk from 'chalk';
import pkg from '../../package.json';

function getWidth(): number {
  return process.stdout.columns || 80;
}

const ASCII_ART = [
  '███████╗███████╗██╗  ██╗██████╗  ██████╗ ██████╗ ████████╗',
  '██╔════╝██╔════╝╚██╗██╔╝██╔══██╗██╔═══██╗██╔══██╗╚══██╔══╝',
  '█████╗  █████╗   ╚███╔╝ ██████╔╝██║   ██║██████╔╝   ██║   ',
  '██╔══╝  ██╔══╝   ██╔██╗ ██╔═══╝ ██║   ██║██╔══██╗   ██║   ',
  '██║     ███████╗██╔╝ ██╗██║     ╚██████╔╝██║  ██║   ██║   ',
  '╚═╝     ╚══════╝╚═╝  ╚═╝╚═╝      ╚═════╝ ╚═╝  ╚═╝   ╚═╝',
];

export function showBanner(): void {
  const width = getWidth();
  const isSmall = width < 65;

  if (isSmall) {
    console.log(`\n  ${chalk.cyan.bold('F-EXPORT')} ${chalk.gray(`v${pkg.version}`)}`);
    console.log(`  ${chalk.white.bold('Framer · Webflow · Wix Exporter')}\n`);
    return;
  }

  const cyan = chalk.cyan.bold;
  const gray = chalk.gray;

  console.log('');
  ASCII_ART.forEach((line) => {
    console.log('  ' + cyan(line));
  });
  console.log('');
  console.log(`  ${gray(`v${pkg.version}`)}  ${chalk.white.bold('Framer · Webflow · Wix Exporter')}\n`);
}
