import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { log } from '../logger/index.js';
import type { ExporterContext } from '../types.js';

export async function printSummary(exporter: ExporterContext): Promise<void> {
  const count = async (d: string): Promise<number> => {
    try {
      return (await fs.readdir(path.join(exporter.outDir, d))).length;
    } catch {
      return 0;
    }
  };
  const [imgs, fonts, scripts, vendor, styles, data] = await Promise.all([
    count('assets/images'),
    count('assets/fonts'),
    count('scripts/modules'),
    count('scripts/vendor'),
    count('styles'),
    count('data'),
  ]);

  console.log('');
  console.log(chalk.bold.white(`  ${exporter.platform.displayName} Export Summary`));
  console.log(chalk.gray('  ' + '─'.repeat(40)));
  console.log(`  ${chalk.yellow('index.html')}        ${chalk.gray('Main page')}`);
  console.log(`  ${chalk.yellow('styles/')}           ${chalk.white(String(styles))} ${chalk.gray('CSS files')}`);
  console.log(`  ${chalk.yellow('scripts/vendor/')}   ${chalk.white(String(vendor))} ${chalk.gray('JS modules')}`);
  console.log(`  ${chalk.yellow('scripts/modules/')}  ${chalk.white(String(scripts))} ${chalk.gray('components')}`);
  console.log(`  ${chalk.yellow('assets/images/')}    ${chalk.white(String(imgs))} ${chalk.gray('images')}`);
  console.log(`  ${chalk.yellow('assets/fonts/')}     ${chalk.white(String(fonts))} ${chalk.gray('fonts')}`);
  console.log(`  ${chalk.yellow('data/')}             ${chalk.white(String(data))} ${chalk.gray('data files')}`);
  console.log('');

  const quotedDir: string = `"${exporter.outDir}"`;
  console.log(chalk.bold.white('  To serve locally:'));
  console.log(chalk.gray('  ' + '─'.repeat(40)));
  console.log(`  ${chalk.cyan('cd ' + quotedDir + ' && node serve.cjs')}`);
  console.log(`  ${chalk.gray('or:')} ${chalk.cyan('npx serve ' + quotedDir)}`);
  console.log('');
  console.log(chalk.gray('  NOTE: Must be served via HTTP (not file://) for JS modules.'));
  console.log('');
}
