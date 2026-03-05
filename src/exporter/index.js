import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { AssetMap } from '../assets/asset-map.js';
import { dlBuffer } from '../network/download.js';
import { info, success } from '../logger/index.js';
import { launchAndCapture } from './capture.js';
import { downloadAll } from './download.js';
import { buildOutput } from './output.js';
import { printSummary } from './summary.js';

export class FramerExporter {
  constructor(siteUrl, outDir) {
    this.siteUrl = siteUrl;
    this.outDir = outDir;
    this.assets = new AssetMap();
    this.browser = null;
    this.page = null;
    this.ssrHTML = '';
  }

  async run() {
    console.log(
      chalk.bold.magenta('\n[EXPORT] ExporterLand v3 - Full Mirror & Clean Export')
    );
    info(`Source  : ${chalk.underline(this.siteUrl)}`);
    info(`Output  : ${chalk.yellow(this.outDir)}`);

    for (const d of [
      '',
      'assets/images',
      'assets/fonts',
      'assets/misc',
      'styles',
      'scripts/framer',
      'scripts/modules',
      'data',
    ]) {
      await fs.mkdir(path.join(this.outDir, d), { recursive: true });
    }

    const ssrSpin = ora({ text: 'Fetching SSR HTML...', color: 'yellow' }).start();
    try {
      const buf = await dlBuffer(this.siteUrl);
      this.ssrHTML = buf.toString('utf-8');
      ssrSpin.stopAndPersist({
        symbol: chalk.green('[SUCCESS]'),
        text: `SSR HTML fetched (${(this.ssrHTML.length / 1024).toFixed(1)} KB)`,
      });
    } catch (e) {
      ssrSpin.stopAndPersist({
        symbol: chalk.red('[ERROR]'),
        text: 'Could not fetch SSR HTML: ' + e.message,
      });
    }

    await launchAndCapture(this);

    await downloadAll(this);

    await buildOutput(this);

    success('Export complete!');
    await printSummary(this);
  }
}
