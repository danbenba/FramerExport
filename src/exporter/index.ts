import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
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
import { CookingSpinner } from '../cli/cooking.js';

export class FramerExporter implements ExporterContext {
  siteUrl: string;
  outDir: string;
  assets: AssetMap;
  browser: Browser | null;
  page: Page | null;
  ssrHTML: string;
  prettyPrint: boolean;
  platform: PlatformHandler;
  cooking?: CookingSpinner;

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
      chalk.bold.magenta('\n  Cooksite v4 - Full Mirror & Clean Export\n')
    );
    info(`Source   : ${chalk.underline(this.siteUrl)}`);
    info(`Output   : ${chalk.yellow(this.outDir)}`);
    info(`Platform : ${chalk.magenta(this.platform.displayName)}`);
    console.log('');

    this.cooking = new CookingSpinner();
    this.cooking.start('Preparing directories...');

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

    this.cooking.update('Fetching SSR HTML...');
    try {
      const buf: Buffer = await dlBuffer(this.siteUrl);
      this.ssrHTML = buf.toString('utf-8');
      log(`  ${chalk.green('✓')} SSR HTML fetched (${(this.ssrHTML.length / 1024).toFixed(1)} KB)`);
    } catch (e) {
      log(`  ${chalk.red('✗')} Could not fetch SSR HTML: ${(e as Error).message}`);
    }

    const htmlDetected = detectPlatform(this.siteUrl, this.ssrHTML);
    if (htmlDetected.name !== this.platform.name) {
      this.platform = htmlDetected;
      log(`  ${chalk.blue('i')} Platform refined: ${chalk.magenta(this.platform.displayName)}`);
    }

    await launchAndCapture(this);

    this.cooking.update('Downloading assets...');
    await downloadAll(this);

    this.cooking.update('Building output...');
    await buildOutput(this);

    this.cooking.stop();

    console.log('');
    success('Export complete!');
    await printSummary(this);
  }
}
