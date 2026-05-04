import pkg from '../../package.json';
import { chip, softGradient, ui } from './theme.js';

function getWidth(): number {
  return process.stdout.columns || 80;
}

const ASCII_ART = [
  '███████╗██████╗  █████╗ ███╗   ███╗███████╗██████╗ ',
  '██╔════╝██╔══██╗██╔══██╗████╗ ████║██╔════╝██╔══██╗',
  '█████╗  ██████╔╝███████║██╔████╔██║█████╗  ██████╔╝',
  '██╔══╝  ██╔══██╗██╔══██║██║╚██╔╝██║██╔══╝  ██╔══██╗',
  '██║     ██║  ██║██║  ██║██║ ╚═╝ ██║███████╗██║  ██║',
  '╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚══════╝╚═╝  ╚═╝',
  '███████╗██╗  ██╗██████╗  ██████╗ ██████╗ ████████╗',
  '██╔════╝╚██╗██╔╝██╔══██╗██╔═══██╗██╔══██╗╚══██╔══╝',
  '█████╗   ╚███╔╝ ██████╔╝██║   ██║██████╔╝   ██║   ',
  '██╔══╝   ██╔██╗ ██╔═══╝ ██║   ██║██╔══██╗   ██║   ',
  '███████╗██╔╝ ██╗██║     ╚██████╔╝██║  ██║   ██║   ',
  '╚══════╝╚═╝  ╚═╝╚═╝      ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ',
];

export function showBanner(): void {
  const width = getWidth();
  const isSmall = width < 65;

  if (isSmall) {
    console.log(
      `\n  ${ui.primary.bold('f-export')} ${ui.muted(`v${pkg.version}`)} ${chip('beta ui')}`
    );
    console.log(`  ${ui.text.bold('Framer Export')} ${ui.muted('for Framer, Webflow, and Wix')}\n`);
    return;
  }

  console.log('');
  ASCII_ART.forEach((line) => {
    console.log('  ' + softGradient(line));
  });
  console.log('');
  console.log(
    `  ${ui.muted(`v${pkg.version}`)}  ${ui.text.bold('Framer Export')}  ${chip('fexport')} ${ui.muted('local mirror exporter')}`
  );
  console.log(
    `  ${ui.muted('Framer')} ${ui.border('/')} ${ui.muted('Webflow')} ${ui.border('/')} ${ui.muted('Wix')} ${ui.border('·')} ${ui.primary('clean assets')} ${ui.border('·')} ${ui.secondary('local serve')}\n`
  );
}
