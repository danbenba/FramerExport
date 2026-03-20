import chalk from 'chalk';

const ASCII_ART = `
  ${chalk.magenta('╔══════════════════════════════════════════════════════════════╗')}
  ${chalk.magenta('║')}                                                              ${chalk.magenta('║')}
  ${chalk.magenta('║')}   ${chalk.bold.cyan('  ___                          ___                  _')}    ${chalk.magenta('║')}
  ${chalk.magenta('║')}   ${chalk.bold.cyan(' | __| _ __ _ _ __  ___ _ _   | __|_ ___ __  ___ _ _| |_')}  ${chalk.magenta('║')}
  ${chalk.magenta('║')}   ${chalk.bold.cyan(" | _| '_/ _` | '  \\/ -_) '_|  | _|\\ \\ / '_ \\/ _ \\ '_|  _|")} ${chalk.magenta('║')}
  ${chalk.magenta('║')}   ${chalk.bold.cyan(' |_||_| \\__,_|_|_|_\\___|_|    |___/_\\_\\ .__/\\___/_|  \\__|')} ${chalk.magenta('║')}
  ${chalk.magenta('║')}   ${chalk.bold.cyan('                                       |_|')}                 ${chalk.magenta('║')}
  ${chalk.magenta('║')}                                                              ${chalk.magenta('║')}
  ${chalk.magenta('║')}        ${chalk.gray('v2.0.0')}  ${chalk.white.bold('Full Mirror & Clean Export Tool')}           ${chalk.magenta('║')}
  ${chalk.magenta('║')}                                                              ${chalk.magenta('║')}
  ${chalk.magenta('╚══════════════════════════════════════════════════════════════╝')}
`;

export function showBanner() {
  console.log(ASCII_ART);
}
