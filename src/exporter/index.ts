import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import type { Browser, Page } from 'puppeteer';
import { AssetMap } from '../assets/asset-map.js';
import { dlBuffer } from '../network/download.js';
import { info, log, success, setCooking } from '../logger/index.js';
import { launchAndCapture } from './capture.js';
import { downloadAll } from './download.js';
import { buildOutput } from './output.js';
import { printSummary } from './summary.js';
import { detectPlatform, getPlatformByName } from '../platforms/index.js';
import type { PlatformHandler, PlatformType } from '../platforms/types.js';
import type { ExporterContext } from '../types.js';
import { CookingSpinner } from '../cli/cooking.js';

export function deriveOutputName(url: string, platformName: PlatformType): string {
  try {
    const parsed = new URL(url);
    const hostname: string = parsed.hostname;

    let siteName: string;
    if (hostname.endsWith('.webflow.io')) {
      siteName = hostname.replace('.webflow.io', '');
    } else if (hostname.includes('.wixsite.com')) {
      const parts: string[] = parsed.pathname.split('/').filter(Boolean);
      siteName = parts[0] || hostname.split('.')[0];
    } else if (hostname.match(/\.framer\.(app|website|ai)$/)) {
      siteName = hostname.split('.framer.')[0];
    } else {
      siteName = hostname.replace(/\./g, '-');
    }

    return `${platformName}-${siteName}`;
  } catch {
    return 'cooksite-export';
  }
}

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
    console.log(chalk.bold.magenta('\n  Cooksite v4 - Full Mirror & Clean Export\n'));
    info('Source   : ' + chalk.underline(this.siteUrl));
    info('Output   : ' + chalk.yellow(this.outDir));
    info('Platform : ' + chalk.magenta(this.platform.displayName));
    console.log('');

    this.cooking = new CookingSpinner();
    setCooking(this.cooking);
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
    log('Output directory structure created');

    this.cooking.update('Fetching SSR HTML...');
    log('Fetching SSR HTML from ' + this.siteUrl);
    try {
      const buf: Buffer = await dlBuffer(this.siteUrl);
      this.ssrHTML = buf.toString('utf-8');
      success('SSR HTML fetched (' + (this.ssrHTML.length / 1024).toFixed(1) + ' KB)');
    } catch (e) {
      log(chalk.red('Could not fetch SSR HTML: ' + (e as Error).message));
    }

    const htmlDetected = detectPlatform(this.siteUrl, this.ssrHTML);
    if (htmlDetected.name !== this.platform.name) {
      this.platform = htmlDetected;
      log('Platform refined: ' + chalk.magenta(this.platform.displayName) + ' (from HTML analysis)');
    }

    await launchAndCapture(this);

    this.cooking.update('Downloading assets...');
    await downloadAll(this);

    this.cooking.update('Building output...');
    await buildOutput(this);

    this.cooking.stop();
    setCooking(null);

    console.log('');
    success('Export complete!');
    await printSummary(this);
  }
}
