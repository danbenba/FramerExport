import type { Browser, Page } from 'puppeteer';
import type { AssetMap } from './assets/asset-map.js';
import type { PlatformHandler } from './platforms/types.js';
import type { CookingSpinner } from './cli/cooking.js';

export interface Config {
  viewport: { width: number; height: number };
  timeout: number;
  scrollStep: number;
  scrollDelay: number;
  concurrency: number;
  retries: number;
  dlTimeout: number;
  sharedStripDomains: string[];
}

export interface ExporterContext {
  siteUrl: string;
  outDir: string;
  assets: AssetMap;
  browser: Browser | null;
  page: Page | null;
  ssrHTML: string;
  prettyPrint?: boolean;
  platform: PlatformHandler;
  cooking?: CookingSpinner;
}
