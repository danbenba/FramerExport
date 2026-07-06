import type { PlatformHandler, PlatformType } from './types.js';
import type { Page } from 'puppeteer';
import { PLATFORM_REGISTRY, sortedByPriority } from './registry.js';
import { framer } from './framer.js';

/** Extract the `<meta name="generator">` content, if any. */
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
  // Generator meta is the most reliable HTML signal, so try it first.
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
  // 1. Legacy signal scan — kept byte-identical to v4 so the frozen trio's
  //    DOM refinement never changes.
  try {
    const signal: string = await page.evaluate(() => {
      const html: string = document.documentElement.outerHTML || '';

      if (/wix-viewer-model|_wix_|wix-ecom/i.test(html)) return 'wix';
      if (/data-wf-|w-webflow-badge|webflow\.js/i.test(html)) return 'webflow';
      if (/framerusercontent|framercanvas|framerstatic/i.test(html)) return 'framer';

      const srcs: string[] = [];
      const scripts: NodeListOf<HTMLScriptElement> = document.querySelectorAll('script[src]');
      scripts.forEach((s) => {
        if (s.src) srcs.push(s.src);
      });
      const allSrcs: string = srcs.join(' ');
      if (/wixstatic\.com|parastorage\.com/.test(allSrcs)) return 'wix';
      if (/website-files\.com|webflow\.com/.test(allSrcs)) return 'webflow';
      if (/framerusercontent\.com|framerstatic\.com|framer\.app/.test(allSrcs)) return 'framer';

      return '';
    });

    if (signal) return getPlatformByName(signal as PlatformType);
  } catch {}

  // 2. Per-platform live-DOM probes (new platforms only), in priority order.
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
