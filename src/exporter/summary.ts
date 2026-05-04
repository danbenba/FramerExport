import fs from 'fs/promises';
import path from 'path';
import type { ExporterContext } from '../types.js';
import { boxTop, boxLine, boxBot, boxSep, maxWidth } from '../cli/box.js';
import { chip, ui } from '../cli/theme.js';

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

  const G = ui.primary;
  const G2 = ui.primarySoft;
  const C2 = ui.secondary;
  const Y = ui.accent;
  const O = ui.warning;
  const Br = ui.info;
  const Gr = ui.muted;
  const Gn = ui.success;

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
    console.log(boxLine(w, `${ui.text.bold('  Export Summary')} ${chip('done')}`));
    console.log(boxSep(w));
  } else {
    console.log(ui.text.bold('  Export Summary:'));
  }

  for (const [label, cnt, type, color] of entries) {
    if (cnt === 0) continue;
    const inner = w - 4;
    const l = label.padEnd(16);
    const c = String(cnt).padStart(3);
    const rowText = `${color(l)}${ui.text(c)}  ${ui.muted(type)}`;
    const visible = 16 + 3 + 2 + type.length;
    const pad = Math.max(0, inner - visible);
    if (isSmall) {
      console.log(`  ${color(label)} ${ui.text(String(cnt))} ${ui.muted(type)}`);
    } else {
      console.log('  ' + ui.border('│ ') + rowText + ' '.repeat(pad) + ui.border(' │'));
    }
  }

  if (!isSmall) {
    console.log(boxBot(w));
  }

  console.log('');
  const cdCmd = 'cd ' + path.basename(exporter.outDir) + ' && node serve.cjs';
  if (!isSmall) {
    console.log(boxTop(w));
    console.log(boxLine(w, ui.text.bold('  To serve locally')));
    console.log(boxSep(w));
    const inner = w - 6;
    const cmdLen = cdCmd.length;
    const pad = Math.max(0, inner - cmdLen);
    console.log(
      '  ' + ui.border('│ ') + G(cdCmd) + ' '.repeat(pad) + ui.muted(' copy') + ui.border(' │')
    );
    console.log(boxBot(w));
  } else {
    console.log(ui.text.bold('  To serve locally:'));
    console.log(`  ${G(cdCmd)}`);
  }

  console.log('');
  console.log(ui.muted('  note: must be served via HTTP for JS modules to work.'));
  console.log('');
}
