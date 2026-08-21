import type { Page } from 'puppeteer';
import type { ExporterContext } from '../types.js';
export type PlatformCategory = 'builder' | 'landing' | 'cms' | 'course' | 'ecommerce' | 'ai';
export type PlatformType =
  | 'framer'
  | 'webflow'
  | 'wix'
  | 'bubble'
  | 'carrd'
  | 'duda'
  | 'squarespace'
  | 'strikingly'
  | 'tilda'
  | 'weebly'
  | 'clickfunnels'
  | 'elementor'
  | 'instapage'
  | 'systemeio'
  | 'unbounce'
  | 'ghost'
  | 'notion'
  | 'wordpress'
  | 'kajabi'
  | 'podia'
  | 'teachable'
  | 'thinkific'
  | 'gumroad'
  | 'shopify'
  | 'gamma'
  | 'unknown';
export type ScrollStrategy = 'standard' | 'infinite' | 'paginated' | 'none';
export interface PlatformHandler {
  name: PlatformType;
  displayName: string;
  category: PlatformCategory;
  priority: number;
  detectByUrl(url: string): boolean;
  detectByHtml(html: string): boolean;
  detectByDom?(page: Page): Promise<boolean>;
  detectGenerator?: RegExp;
  stripDomains: string[];
  stripSelectors: string[];
  stripPatterns: RegExp[];
  stripScripts?: RegExp[];
  hydrationTimeout: number;
  needsHydrationCheck: boolean;
  hydrationSelector?: string;
  scrollStrategy?: ScrollStrategy;
  captureRenderedDom?: boolean;
  mapAssetDir(host: string, pathname: string, ext: string): string | null;
  skipAssetUrls?: RegExp[];
  lazyChunkDirs?: string[];
  rewritePatterns?: Array<{
    from: RegExp;
    to: string;
  }>;
  rewriteUrlPatterns?: Array<{
    from: RegExp;
    to: string;
  }>;
  preCapture?(page: Page): Promise<void>;
  postCapture?(html: string, ctx: ExporterContext): string;
  postProcess?(ctx: ExporterContext): Promise<void>;
}
