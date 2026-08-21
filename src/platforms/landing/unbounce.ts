import type { PlatformHandler } from '../types.js';
const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];
export const unbounce: PlatformHandler = {
  name: 'unbounce',
  displayName: 'Unbounce',
  category: 'landing',
  priority: 82,
  detectByUrl(url: string): boolean {
    return /\.(?:unbouncepages|ubpages)\.com/i.test(url);
  },
  detectByHtml(html: string): boolean {
    return (
      html.includes('lp-pom-root') ||
      html.includes('window.ub.page') ||
      html.includes('builder-assets.unbounce.com') ||
      html.includes('ubembed.com')
    );
  },
  stripDomains: [],
  stripSelectors: [],
  stripPatterns: [/<a[^>]*href="https?:\/\/(?:www\.)?unbounce\.com[^"]*"[^>]*>[\s\S]*?<\/a>/gi],
  hydrationTimeout: 0,
  needsHydrationCheck: false,
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (host.includes('builder-assets.unbounce.com') || host.includes('assets.unbounce.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext) || pathname.includes('/lp-image')) return 'assets/images';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.json') return 'data';
      return 'assets/misc';
    }
    if (host.includes('ubembed.com')) {
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/misc';
    }
    if (host.includes('cloudfront.net')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext) || pathname.includes('/images/')) return 'assets/images';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/misc';
    }
    return null;
  },
};
