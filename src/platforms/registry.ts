import type { PlatformHandler, PlatformCategory } from './types.js';
import { framer } from './framer.js';
import { webflow } from './webflow.js';
import { wix } from './wix.js';
import { bubble } from './builder/bubble.js';
import { carrd } from './builder/carrd.js';
import { duda } from './builder/duda.js';
import { squarespace } from './builder/squarespace.js';
import { strikingly } from './builder/strikingly.js';
import { tilda } from './builder/tilda.js';
import { weebly } from './builder/weebly.js';
import { clickfunnels } from './landing/clickfunnels.js';
import { elementor } from './landing/elementor.js';
import { instapage } from './landing/instapage.js';
import { systemeio } from './landing/systemeio.js';
import { unbounce } from './landing/unbounce.js';
import { ghost } from './cms/ghost.js';
import { notion } from './cms/notion.js';
import { wordpress } from './cms/wordpress.js';
import { kajabi } from './course/kajabi.js';
import { podia } from './course/podia.js';
import { teachable } from './course/teachable.js';
import { thinkific } from './course/thinkific.js';
import { gumroad } from './ecommerce/gumroad.js';
import { shopify } from './ecommerce/shopify.js';
import { gamma } from './ai/gamma.js';
export const PLATFORM_REGISTRY: PlatformHandler[] = [
  framer,
  webflow,
  wix,
  bubble,
  carrd,
  duda,
  squarespace,
  strikingly,
  tilda,
  weebly,
  clickfunnels,
  elementor,
  instapage,
  systemeio,
  unbounce,
  ghost,
  notion,
  wordpress,
  kajabi,
  podia,
  teachable,
  thinkific,
  gumroad,
  shopify,
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
export function sortedByPriority(): PlatformHandler[] {
  return [...PLATFORM_REGISTRY].sort((a, b) => b.priority - a.priority);
}
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
export const STABLE_PLATFORMS = new Set<string>(['framer', 'webflow', 'wix']);
export function isBetaPlatform(name: string): boolean {
  return !STABLE_PLATFORMS.has(name);
}
