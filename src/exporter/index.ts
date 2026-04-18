import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import type { Browser, Page } from 'puppeteer';
import { AssetMap } from '../assets/asset-map.js';
import { dlBuffer } from '../network/download.js';
import { info, log, success } from '../logger/index.js';
import { launchAndCapture } from './capture.js';
import { downloadAll } from './download.js';
import { buildOutput } from './output.js';
import { printSummary } from './summary.js';
import { detectPlatform, getPlatformByName } from '../platforms/index.js';
import type { PlatformHandler, PlatformType } from '../platforms/types.js';
import type { ExporterContext } from '../types.js';

export class FramerExporter implements ExporterContext {
  siteUrl: string;
  outDir: string;
  assets: AssetMap;
  browser: Browser | null;
  page: Page | null;
  ssrHTML: string;
  prettyPrint: boolean;
  platform: PlatformHandler;

  constructor(siteUrl: string, outDir: string, platformOverride?: PlatformType) {
    this.siteUrl = siteUrl;
    this.outDir = outDir;
    this.assets = new AssetMap();
    this.browser = null;
    this.page = null;
    this.ssrHTML = '';
    this.prettyPrint = true;

    if (platformOverride && platformOverride !== 'unknown') {
      this.platform = getPlatformByName(platformOverride);
    } else {
      this.platform = detectPlatform(siteUrl);
    }
  }

  async run(): Promise<void> {
    console.log(
      chalk.bold.magenta('\n[EXPORT] ExporterLand v3 - Full Mirror & Clean Export')
    );
    info(`Source   : ${chalk.underline(this.siteUrl)}`);
    info(`Output   : ${chalk.yellow(this.outDir)}`);
    info(`Platform : ${chalk.magenta(this.platform.displayName)}`);

    for (const d of [
      '',
      'assets/images',
      'assets/fonts',
      'assets/misc',
      'styles',
      'scripts/vendor',
      'scripts/modules',
      'data',
    ]) {
      await fs.mkdir(path.join(this.outDir, d), { recursive: true });
    }

    const ssrSpin = ora({ text: 'Fetching SSR HTML...', color: 'yellow' }).start();
    try {
      const buf: Buffer = await dlBuffer(this.siteUrl);
      this.ssrHTML = buf.toString('utf-8');
      ssrSpin.stopAndPersist({
        symbol: chalk.green('[SUCCESS]'),
        text: `SSR HTML fetched (${(this.ssrHTML.length / 1024).toFixed(1)} KB)`,
      });
    } catch (e) {
      ssrSpin.stopAndPersist({
        symbol: chalk.red('[ERROR]'),
        text: 'Could not fetch SSR HTML: ' + (e as Error).message,
      });
    }

    const htmlDetected = detectPlatform(this.siteUrl, this.ssrHTML);
    if (htmlDetected.name !== this.platform.name) {
      this.platform = htmlDetected;
      log(`  Platform refined: ${chalk.magenta(this.platform.displayName)} (from HTML analysis)`);
    }

    await launchAndCapture(this);

    await downloadAll(this);

    await buildOutput(this);

    success('Export complete!');
    await printSummary(this);
  }
}
