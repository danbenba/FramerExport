import type { Page } from 'puppeteer';
import type { ExporterContext } from '../types.js';

/**
 * Platform categories used by the grouped CLI selector and the registry.
 */
export type PlatformCategory = 'builder' | 'landing' | 'cms' | 'course' | 'ecommerce' | 'ai';

/**
 * All platforms known to the exporter. The frozen trio (framer/webflow/wix)
 * keeps its original behaviour; every other name is added by a dedicated
 * one-file-per-platform handler under src/platforms/<category>/.
 */
export type PlatformType =
  // frozen (v4) — do not change their pipeline behaviour
  | 'framer'
  | 'webflow'
  | 'wix'
  // website builders
  | 'bubble'
  | 'carrd'
  | 'duda'
  | 'squarespace'
  | 'strikingly'
  | 'tilda'
  | 'weebly'
  // landing pages & funnels
  | 'clickfunnels'
  | 'elementor'
  | 'instapage'
  | 'systemeio'
  | 'unbounce'
  // cms & blogs
  | 'ghost'
  | 'notion'
  | 'wordpress'
  // courses & membership
  | 'kajabi'
  | 'podia'
  | 'teachable'
  | 'thinkific'
  // e-commerce
  | 'gumroad'
  | 'shopify'
  // ai & presentations
  | 'gamma'
  | 'unknown';

export type ScrollStrategy = 'standard' | 'infinite' | 'paginated' | 'none';

export interface PlatformHandler {
  // ── identity ──────────────────────────────────────────────────────────────
  name: PlatformType;
  displayName: string;
  /** Grouping bucket for the CLI selector. */
  category: PlatformCategory;
  /** Detection tie-breaker (0–100). Higher wins when several handlers match. */
  priority: number;

  // ── detection ─────────────────────────────────────────────────────────────
  detectByUrl(url: string): boolean;
  detectByHtml(html: string): boolean;
  /** Optional live-DOM probe, evaluated inside Puppeteer after navigation. */
  detectByDom?(page: Page): Promise<boolean>;
  /** Matched against the `<meta name="generator">` content when present. */
  detectGenerator?: RegExp;

  // ── stripping (badges, trackers, editor chrome) ───────────────────────────
  stripDomains: string[];
  stripSelectors: string[];
  stripPatterns: RegExp[];
  /** Extra regexes removed from the final HTML (e.g. inline analytics scripts). */
  stripScripts?: RegExp[];

  // ── capture ───────────────────────────────────────────────────────────────
  hydrationTimeout: number;
  needsHydrationCheck: boolean;
  /** CSS selector that signals the app has hydrated. Defaults to '#main'. */
  hydrationSelector?: string;
  /** How the page should be scrolled to trigger lazy loading. Defaults to 'standard'. */
  scrollStrategy?: ScrollStrategy;
  /**
   * When true, the exporter uses the fully-rendered DOM (after hydration/scroll)
   * as the HTML source instead of the raw SSR response. Required for SPA/React
   * platforms (Notion, Bubble, Gamma) whose SSR body is empty.
   */
  captureRenderedDom?: boolean;

  // ── assets ────────────────────────────────────────────────────────────────
  mapAssetDir(host: string, pathname: string, ext: string): string | null;
  /** Extra string/regex URL rewrites applied to HTML and downloaded text files. */
  rewriteUrlPatterns?: Array<{ from: RegExp; to: string }>;

  // ── lifecycle hooks (all optional, no-op for the frozen trio) ─────────────
  /** Runs on the live page before the hydration wait (e.g. dismiss overlays). */
  preCapture?(page: Page): Promise<void>;
  /** Transforms the HTML string after strip + before URL rewrite. */
  postCapture?(html: string, ctx: ExporterContext): string;
  /** Runs after all files are written (e.g. inline CSS, fix SPA routing). */
  postProcess?(ctx: ExporterContext): Promise<void>;
}
