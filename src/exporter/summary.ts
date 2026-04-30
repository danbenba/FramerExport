import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import type { ExporterContext } from '../types.js';
import { boxTop, boxLine, boxBot, boxSep, maxWidth } from '../cli/box.js';

export async function printSummary(exporter: ExporterContext): Promise<void> {
  const w = maxWidth();
  const isSmall = w < 50;

  const count = async (d: string): Promise<number> => {
    try {
      return (await fs.readdir(path.join(exporter.outDir, d))).length;
    } catch {
      return 0;
    }
  };
  const [imgs, fonts, videos, misc, scripts, vendor, styles, data, subpages] = await Promise.all([
    count('assets/images'),
    count('assets/fonts'),
    count('assets/videos'),
    count('assets/misc'),
    count('scripts/modules'),
    count('scripts/vendor'),
    count('styles'),
    count('data'),
    count('subpages'),
  ]);

  const G = chalk.hex('#D4A017');
  const G2 = chalk.hex('#DAA520');
  const C2 = chalk.hex('#E0B040');
  const Y = chalk.yellow;
  const O = chalk.hex('#CC7722');
  const Br = chalk.hex('#B8860B');
  const Gr = chalk.gray;
  const Gn = chalk.green;

  const entries: Array<[string, number, string, (s: string) => string]> = [
    ['styles/', styles, 'CSS', G],
    ['scripts/vendor/', vendor, 'JS vendor', G2],
    ['scripts/modules/', scripts, 'JS modules', C2],
    ['assets/images/', imgs, 'images', Y],
    ['assets/videos/', videos, 'videos', O],
    ['assets/fonts/', fonts, 'fonts', Br],
    ['assets/misc/', misc, 'misc', Gr],
    ['data/', data, 'data', Gr],
    ['subpages/', subpages, 'pages', Gn],
  ];

  console.log('');
  if (!isSmall) {
    console.log(boxTop(w));
    console.log(boxLine(w, chalk.bold.white('  Export Summary')));
    console.log(boxSep(w));
  } else {
    console.log(chalk.bold.white('  Export Summary:'));
  }

  for (const [label, cnt, type, color] of entries) {
    if (cnt === 0) continue;
    const inner = w - 4;
    const l = label.padEnd(16);
    const c = String(cnt).padStart(3);
    const rowText = `${color(l)}${chalk.white(c)}  ${chalk.gray(type)}`;
    const visible = 16 + 3 + 2 + type.length;
    const pad = Math.max(0, inner - visible);
    if (isSmall) {
      console.log(`  ${color(label)} ${chalk.white(String(cnt))} ${chalk.gray(type)}`);
    } else {
      console.log('  ' + chalk.hex('#C4953A')('║ ') + rowText + ' '.repeat(pad) + chalk.hex('#C4953A')(' ║'));
    }
  }

  if (!isSmall) {
    console.log(boxBot(w));
  }

  console.log('');
  const cdCmd = 'cd ' + path.basename(exporter.outDir) + ' && node serve.cjs';
  if (!isSmall) {
    console.log(boxTop(w));
    console.log(boxLine(w, chalk.bold.white('  To serve locally')));
    console.log(boxSep(w));
    const inner = w - 6;
    const cmdLen = cdCmd.length;
    const pad = Math.max(0, inner - cmdLen);
    console.log('  ' + chalk.hex('#C4953A')('║ ') + G(cdCmd) + ' '.repeat(pad) + chalk.hex('#9e9e9e')(' 🗐') + chalk.hex('#C4953A')(' ║'));
    console.log(boxBot(w));
  } else {
    console.log(chalk.bold.white('  To serve locally:'));
    console.log(`  ${G(cdCmd)}`);
  }
  
  console.log('');
  console.log(chalk.gray('  NOTE: Must be served via HTTP for JS modules to work.'));
  console.log('');
}
