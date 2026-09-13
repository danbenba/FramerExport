import type { PlatformHandler, PlatformType } from './types.js';
import type { Page } from 'puppeteer';
import { PLATFORM_REGISTRY, sortedByPriority } from './registry.js';
import { framer } from './framer.js';
export function readGenerator(html: string): string {
  const m =
    html.match(/<meta[^>]+name=["']generator["'][^>]*content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']generator["']/i);
  return m ? m[1] : '';
}
export function detectByUrl(url: string): PlatformHandler | null {
  for (const platform of sortedByPriority()) {
    try {
      if (platform.detectByUrl(url)) return platform;
    } catch {}
  }
  return null;
}
export function detectByGenerator(html: string): PlatformHandler | null {
  const gen = readGenerator(html);
  if (!gen) return null;
  for (const platform of sortedByPriority()) {
    if (platform.detectGenerator && platform.detectGenerator.test(gen)) return platform;
  }
  return null;
}
export function detectByHtml(html: string): PlatformHandler | null {
  const byGen = detectByGenerator(html);
  if (byGen) return byGen;
  for (const platform of sortedByPriority()) {
    try {
      if (platform.detectByHtml(html)) return platform;
    } catch {}
  }
  return null;
}
export function detectPlatform(url: string, html?: string): PlatformHandler {
  const byUrl = detectByUrl(url);
  if (byUrl) return byUrl;
  if (html) {
    const byHtml = detectByHtml(html);
    if (byHtml) return byHtml;
  }
  return framer;
}
export async function detectByDom(page: Page): Promise<PlatformHandler | null> {
  try {
    const html = await page.evaluate(() => document.documentElement.outerHTML || '');

    const detected = detectByHtml(html);
    if (detected) return detected;
  } catch {}
  for (const platform of sortedByPriority()) {
    if (!platform.detectByDom) continue;
    try {
      if (await platform.detectByDom(page)) return platform;
    } catch {}
  }
  return null;
}
export function getPlatformByName(name: PlatformType): PlatformHandler {
  const found = PLATFORM_REGISTRY.find((platform) => platform.name === name);
  return found || framer;
}
