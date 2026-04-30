import type { PlatformHandler, PlatformType } from './types.js';
import type { Page } from 'puppeteer';
import { framer } from './framer.js';
import { webflow } from './webflow.js';
import { wix } from './wix.js';

const ALL_PLATFORMS: PlatformHandler[] = [framer, webflow, wix];

export function detectByUrl(url: string): PlatformHandler | null {
  for (const platform of ALL_PLATFORMS) {
    if (platform.detectByUrl(url)) return platform;
  }
  return null;
}

export function detectByHtml(html: string): PlatformHandler | null {
  for (const platform of ALL_PLATFORMS) {
    if (platform.detectByHtml(html)) return platform;
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
    const signal: string = await page.evaluate(() => {
      const html: string = document.documentElement.outerHTML || '';

      if (/wix-viewer-model|_wix_|wix-ecom/i.test(html)) return 'wix';
      if (/data-wf-|w-webflow-badge|webflow\.js/i.test(html)) return 'webflow';
      if (/framerusercontent|framercanvas|framerstatic/i.test(html)) return 'framer';

      const srcs: string[] = [];
      const scripts: NodeListOf<HTMLScriptElement> = document.querySelectorAll('script[src]');
      scripts.forEach((s) => { if (s.src) srcs.push(s.src); });
      const allSrcs: string = srcs.join(' ');
      if (/wixstatic\.com|parastorage\.com/.test(allSrcs)) return 'wix';
      if (/website-files\.com|webflow\.com/.test(allSrcs)) return 'webflow';
      if (/framerusercontent\.com|framerstatic\.com|framer\.app/.test(allSrcs)) return 'framer';

      return '';
    });

    if (signal === 'wix') return wix;
    if (signal === 'webflow') return webflow;
    if (signal === 'framer') return framer;
  } catch {}
  return null;
}

export function getPlatformByName(name: PlatformType): PlatformHandler {
  const map: Record<string, PlatformHandler> = { framer, webflow, wix };
  return map[name] || framer;
}
