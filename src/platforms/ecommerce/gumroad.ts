import type { PlatformHandler } from '../types.js';
const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];
export const gumroad: PlatformHandler = {
  name: 'gumroad',
  displayName: 'Gumroad',
  category: 'ecommerce',
  priority: 80,
  detectByUrl(url: string): boolean {
    return /\.gumroad\.com|\bgum\.co\b/i.test(url);
  },
  detectByHtml(html: string): boolean {
    return (
      html.includes('cable.gumroad.com') ||
      html.includes('assets.gumroad.com') ||
      html.includes('ns/fb/gumroad#') ||
      html.includes('gumroad:product')
    );
  },
  stripDomains: [
    'gumroad-analytics.com',
    'www.googletagmanager.com',
    'connect.facebook.net',
    'analytics.tiktok.com',
  ],
  stripSelectors: [
    'script[src*="gumroad-analytics.com"]',
    'script[src*="googletagmanager.com"]',
    'script[src*="connect.facebook.net"]',
    'script[src*="analytics.tiktok.com"]',
  ],
  stripPatterns: [],
  hydrationTimeout: 8000,
  needsHydrationCheck: true,
  hydrationSelector: '#app',
  captureRenderedDom: true,
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (
      host.includes('assets.gumroad.com') ||
      host.includes('public-files.gumroad.com') ||
      host.includes('static-2.gumroad.com')
    ) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (pathname.includes('/fonts/') || FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (pathname.includes('/stylesheets/') || ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (pathname.includes('/images/') || IMG_EXTS.includes(ext)) return 'assets/images';
      if (ext === '.json') return 'data';
      return 'assets/misc';
    }
    return null;
  },
};
