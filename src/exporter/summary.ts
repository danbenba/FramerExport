import fs from 'fs/promises';
import path from 'path';
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
  log('');
  log(`=== ${exporter.platform.displayName} Export Summary ===`);
  log(`  index.html        - Main page`);
  log(`  styles/           - ${styles} CSS files`);
  log(`  scripts/vendor/   - ${vendor} ${exporter.platform.displayName} JS modules`);
  log(`  scripts/modules/  - ${scripts} component modules`);
  log(`  assets/images/    - ${imgs} images`);
  log(`  assets/fonts/     - ${fonts} fonts`);
  log(`  data/             - ${data} data files`);
  log('');
  log('To view:');
  log(`  cd ${exporter.outDir} && node serve.cjs`);
  log(`  Or: npx serve ${exporter.outDir}`);
  log('');
  log('NOTE: Must be served via HTTP (not file://) for .mjs modules to load.');
}
