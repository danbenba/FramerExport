import type { PlatformHandler, PlatformCategory } from './types.js';

// ── frozen trio (v4) ─────────────────────────────────────────────────────────
import { framer } from './framer.js';
import { webflow } from './webflow.js';
import { wix } from './wix.js';

// ── website builders ─────────────────────────────────────────────────────────
import { bubble } from './builder/bubble.js';
import { carrd } from './builder/carrd.js';
import { duda } from './builder/duda.js';
import { squarespace } from './builder/squarespace.js';
import { strikingly } from './builder/strikingly.js';
import { tilda } from './builder/tilda.js';
import { weebly } from './builder/weebly.js';

// ── landing pages & funnels ──────────────────────────────────────────────────
import { clickfunnels } from './landing/clickfunnels.js';
import { elementor } from './landing/elementor.js';
import { instapage } from './landing/instapage.js';
import { systemeio } from './landing/systemeio.js';
import { unbounce } from './landing/unbounce.js';

// ── cms & blogs ──────────────────────────────────────────────────────────────
import { ghost } from './cms/ghost.js';
import { notion } from './cms/notion.js';
import { wordpress } from './cms/wordpress.js';

// ── courses & membership ─────────────────────────────────────────────────────
import { kajabi } from './course/kajabi.js';
import { podia } from './course/podia.js';
import { teachable } from './course/teachable.js';
import { thinkific } from './course/thinkific.js';

// ── e-commerce ───────────────────────────────────────────────────────────────
import { gumroad } from './ecommerce/gumroad.js';
import { shopify } from './ecommerce/shopify.js';

// ── ai & presentations ───────────────────────────────────────────────────────
import { gamma } from './ai/gamma.js';

/**
 * Single source of truth: every handler the exporter knows about.
 * Detection and the CLI selector both consume this list.
 */
export const PLATFORM_REGISTRY: PlatformHandler[] = [
  // frozen trio first (highest priority, unchanged behaviour)
  framer,
  webflow,
  wix,
  // builders
  bubble,
  carrd,
  duda,
  squarespace,
  strikingly,
  tilda,
  weebly,
  // landing
  clickfunnels,
  elementor,
  instapage,
  systemeio,
  unbounce,
  // cms
  ghost,
  notion,
  wordpress,
  // course
  kajabi,
  podia,
  teachable,
  thinkific,
  // ecommerce
  gumroad,
  shopify,
  // ai
  gamma,
];

export const CATEGORY_LABELS: Record<PlatformCategory, string> = {
  builder: 'Website Builders',
  landing: 'Landing Pages & Funnels',
  cms: 'CMS & Blogs',
  course: 'Courses & Membership',
  ecommerce: 'E-commerce',
  ai: 'AI & Presentations',
};

export const CATEGORY_ORDER: PlatformCategory[] = [
  'builder',
  'landing',
  'cms',
  'course',
  'ecommerce',
  'ai',
];

/** Handlers sorted by detection priority (desc). Used by detect.ts. */
export function sortedByPriority(): PlatformHandler[] {
  return [...PLATFORM_REGISTRY].sort((a, b) => b.priority - a.priority);
}

/** Handlers grouped by category (each group sorted by priority desc). */
export function platformsByCategory(): Record<PlatformCategory, PlatformHandler[]> {
  const out = {} as Record<PlatformCategory, PlatformHandler[]>;
  for (const cat of CATEGORY_ORDER) out[cat] = [];
  for (const handler of PLATFORM_REGISTRY) {
    if (!out[handler.category]) out[handler.category] = [];
    out[handler.category].push(handler);
  }
  for (const cat of CATEGORY_ORDER) {
    out[cat].sort((a, b) => b.priority - a.priority);
  }
  return out;
}
