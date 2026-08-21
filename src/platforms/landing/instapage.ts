import type { PlatformHandler } from '../types.js';
const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];
export const instapage: PlatformHandler = {
  name: 'instapage',
  displayName: 'Instapage',
  category: 'landing',
  priority: 82,
  detectByUrl(url: string): boolean {
    return /\.(?:pagedemo|pageserve)\.co/i.test(url);
  },
  detectByHtml(html: string): boolean {
    return (
      html.includes('instapageSp') ||
      html.includes('_instapageSnowplow') ||
      html.includes('anthill.instapage.com') ||
      html.includes('pageserver.page2')
    );
  },
  stripDomains: [
    'anthill.instapage.com',
    'cdn.instapagemetrics.com',
    'heatmap-events-collector.instapage.com',
    'heatmap.services',
  ],
  stripSelectors: [
    'script[src*="instapagemetrics.com"]',
    'script[src*="anthill.instapage.com"]',
    'script[src*="heatmap.services"]',
  ],
  stripPatterns: [/<iframe[^>]*d3mwhxgzltpnyp\.cloudfront\.net[^>]*>[\s\S]*?<\/iframe>/g],
  hydrationTimeout: 0,
  needsHydrationCheck: false,
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (host.includes('fastcdn.co')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext) || pathname.includes('/u/')) return 'assets/images';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.json') return 'data';
      return 'assets/misc';
    }
    if (host.includes('d3mwhxgzltpnyp.cloudfront.net')) {
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (ext === '.css') return 'styles';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/misc';
    }
    return null;
  },
};
