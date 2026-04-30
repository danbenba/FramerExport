import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { log } from '../logger/index.js';
import type { ExporterContext } from '../types.js';

function getWidth(): number {
  return process.stdout.columns || 80;
}

export async function printSummary(exporter: ExporterContext): Promise<void> {
  const width = getWidth();
  const isSmall = width < 50;

  const count = async (d: string): Promise<number> => {
    try {
      return (await fs.readdir(path.join(exporter.outDir, d))).length;
    } catch {
      return 0;
    }
  };
  const [imgs, fonts, videos, misc, scripts, vendor, styles, data] = await Promise.all([
    count('assets/images'),
    count('assets/fonts'),
    count('assets/videos'),
    count('assets/misc'),
    count('scripts/modules'),
    count('scripts/vendor'),
    count('styles'),
    count('data'),
  ]);

  const G = chalk.hex('#D4A017');

  console.log('');
  if (!isSmall) {
    console.log(G('  ┌─────────────────────────────────────────────┐'));
    console.log(G('  │') + chalk.bold.white('  Export Summary                            ') + G('│'));
    console.log(G('  ├─────────────────────────────────────────────┤'));
  } else {
    console.log(chalk.bold.white('  Export Summary:'));
  }

  const row = (label: string, count: number, type: string) => {
    if (count === 0) return;
    const l = label.padEnd(18);
    const c = String(count).padStart(3);
    if (isSmall) {
      console.log(`  ${chalk.yellow(label)} ${chalk.white(String(count))} ${chalk.gray(type)}`);
    } else {
      console.log(`  ${G('│')} ${chalk.yellow(l)} ${chalk.white(c)} ${chalk.gray(type.padEnd(20))} ${G('│')}`);
    }
  };

  row('styles/', styles, 'CSS files');
  row('scripts/vendor/', vendor, 'JS modules');
  row('scripts/modules/', scripts, 'components');
  row('assets/images/', imgs, 'images');
  row('assets/videos/', videos, 'videos');
  row('assets/fonts/', fonts, 'fonts');
  row('assets/misc/', misc, 'misc files');
  row('data/', data, 'data files');

  if (!isSmall) {
    console.log(G('  └─────────────────────────────────────────────┘'));
  }

  console.log('');
  const quotedDir: string = `"${exporter.outDir}"`;
  
  if (!isSmall) {
    console.log(G('  ┌─────────────────────────────────────────────┐'));
    console.log(G('  │') + chalk.bold.white('  To serve locally                          ') + G('│'));
    console.log(G('  ├─────────────────────────────────────────────┤'));
    console.log(`  ${G('│')} ${chalk.hex('#D4A017')('cd ' + path.basename(exporter.outDir) + ' && node serve.cjs').padEnd(44)} ${G('│')}`);
    console.log(G('  └─────────────────────────────────────────────┘'));
  } else {
    console.log(chalk.bold.white('  To serve locally:'));
    console.log(`  ${chalk.hex('#D4A017')('cd ' + path.basename(exporter.outDir) + ' && node serve.cjs')}`);
  }
  
  console.log('');
  console.log(chalk.gray('  NOTE: Must be served via HTTP for JS modules to work.'));
  console.log('');
}
