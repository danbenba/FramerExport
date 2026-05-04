import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import type { Browser, Page } from 'puppeteer';
import { AssetMap } from '../assets/asset-map.js';
import { dlBuffer } from '../network/download.js';
import { info, log, success, setCooking } from '../logger/index.js';
import { launchAndCapture, captureSubpage, closeBrowser } from './capture.js';
import { downloadAll } from './download.js';
import { buildOutput } from './output.js';
import { printSummary } from './summary.js';
import { runAiPromptAssistant } from '../ai/prompt-assistant.js';
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
    return 'framer-export-output';
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

  async run(includeSubpages: boolean = false): Promise<void> {
    console.log(chalk.bold.hex('#D4A017')('\n  Cooksite v4 - Full Mirror & Clean Export\n'));
    info('Source   : ' + chalk.underline(this.siteUrl));
    info('Output   : ' + chalk.yellow(this.outDir));
    info('Platform : ' + chalk.hex('#D4A017')(this.platform.displayName));
    if (includeSubpages) {
      info('Subpages : ' + chalk.green('enabled'));
    }
    console.log('');

    this.cooking = new CookingSpinner();
    setCooking(this.cooking);
    this.cooking.start('Preparing directories...');

    for (const d of [
      '',
      'assets/images',
      'assets/fonts',
      'assets/videos',
      'assets/misc',
      'styles',
      'scripts/vendor',
      'scripts/modules',
      'data',
      'subpages',
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
      log(
        'Platform refined: ' +
          chalk.hex('#D4A017')(this.platform.displayName) +
          ' (from HTML analysis)'
      );
    }

    await launchAndCapture(this);

    if (includeSubpages && this.page) {
      await this.crawlSubpages();
    }

    await closeBrowser(this);

    this.cooking.update('Downloading assets...');
    await downloadAll(this);

    this.cooking.update('Building output...');
    await buildOutput(this);

    this.cooking.stop();
    setCooking(null);

    console.log('');
    success('Export complete!');
    await printSummary(this);
    await runAiPromptAssistant(this);
  }

  private async crawlSubpages(): Promise<void> {
    this.cooking?.update('Discovering sub-pages...');
    log('Scanning page for internal links...');

    const page = this.page!;
    const baseUrl = new URL(this.siteUrl);
    const baseHost = baseUrl.hostname.replace(/^www\./, '');

    const links: string[] = await page.evaluate((host: string) => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const hrefs = new Set<string>();
      for (const a of anchors) {
        const href = (a as HTMLAnchorElement).href;
        if (
          !href ||
          href.startsWith('javascript:') ||
          href.startsWith('mailto:') ||
          href.startsWith('tel:') ||
          href.startsWith('#')
        )
          continue;
        try {
          const u = new URL(href);
          const h = u.hostname.replace(/^www\./, '');
          if (
            h === host &&
            u.pathname !== '/' &&
            u.pathname !== '' &&
            !u.pathname.startsWith('/#')
          ) {
            hrefs.add(href.split('#')[0]);
          }
        } catch {}
      }
      return Array.from(hrefs);
    }, baseHost);

    log('Found ' + links.length + ' sub-page links');
    const uniqueLinks = [...new Set(links)].slice(0, 50);

    if (uniqueLinks.length === 0) {
      log('No sub-pages to crawl');
      return;
    }

    for (let i = 0; i < uniqueLinks.length; i++) {
      const link = uniqueLinks[i];
      this.cooking?.update('Crawling sub-page ' + (i + 1) + '/' + uniqueLinks.length);
      try {
        const html = await captureSubpage(page, link, {
          needsHydrationCheck: this.platform.needsHydrationCheck,
          hydrationTimeout: this.platform.hydrationTimeout,
        });

        const slug = this.deriveSlug(link, baseUrl);
        const filename = slug + '.html';
        const filepath = path.join(this.outDir, 'subpages', filename);

        await fs.writeFile(filepath, html, 'utf-8');
        log('  Saved: subpages/' + filename);
      } catch (e) {
        log('  Skipped ' + link + ': ' + (e as Error).message);
      }
    }

    success('Sub-pages crawled: ' + uniqueLinks.length);
  }

  private deriveSlug(link: string, baseUrl: URL): string {
    try {
      const u = new URL(link);
      let pathname = u.pathname.replace(/\/+$/, '').replace(/^\//, '');
      if (!pathname) return 'index';
      return pathname.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_') || 'page';
    } catch {
      return 'page';
    }
  }
}
