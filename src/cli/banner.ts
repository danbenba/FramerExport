import chalk from 'chalk';

const ASCII_ART: string = `
  ${chalk.magenta('╔══════════════════════════════════════════════════════════════╗')}
  ${chalk.magenta('║')}                                                              ${chalk.magenta('║')}
  ${chalk.magenta('║')}   ${chalk.bold.cyan('   ___            _        _ _')}                              ${chalk.magenta('║')}
  ${chalk.magenta('║')}   ${chalk.bold.cyan('  / __| ___  ___ | | __ __(_) |_ ___')}                       ${chalk.magenta('║')}
  ${chalk.magenta('║')}   ${chalk.bold.cyan(' | (__ / _ \\/ _ \\| |/ /(_-< |  _/ -_)')}                      ${chalk.magenta('║')}
  ${chalk.magenta('║')}   ${chalk.bold.cyan('  \\___|\\___/\\___/|_\\_\\ /__/_|\\__\\___|')}                      ${chalk.magenta('║')}
  ${chalk.magenta('║')}                                                              ${chalk.magenta('║')}
  ${chalk.magenta('║')}        ${chalk.gray('v4.0.0')}  ${chalk.white.bold('Framer · Webflow · Wix Exporter')}         ${chalk.magenta('║')}
  ${chalk.magenta('║')}                                                              ${chalk.magenta('║')}
  ${chalk.magenta('╚══════════════════════════════════════════════════════════════╝')}
`;

export function showBanner(): void {
  console.log(ASCII_ART);
}
