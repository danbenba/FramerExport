import type { PlatformHandler, PlatformType } from './types.js';
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

export function getPlatformByName(name: PlatformType): PlatformHandler {
  const map: Record<string, PlatformHandler> = { framer, webflow, wix };
  return map[name] || framer;
}
