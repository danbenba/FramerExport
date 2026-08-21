import type { PlatformHandler } from '../types.js';
const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];
export const thinkific: PlatformHandler = {
  name: 'thinkific',
  displayName: 'Thinkific',
  category: 'course',
  priority: 82,
  detectByUrl(url: string): boolean {
    return /\.thinkific\.com/i.test(url);
  },
  detectByHtml(html: string): boolean {
    return (
      html.includes('window.Thinkific') ||
      html.includes('assets.thinkific.com') ||
      html.includes('cdn.thinkific.com') ||
      html.includes('thnc.current_user-initialized')
    );
  },
  stripDomains: ['fast.wistia.net', 'www.google.com'],
  stripSelectors: [],
  stripPatterns: [
    /<div[^>]*class="[^"]*footer__white-label[^"]*"[^>]*>[\s\S]*?<\/div>/g,
    /<a[^>]*href="[^"]*thinkific\.com[^"]*utm_medium=powered-by[^"]*"[^>]*>[\s\S]*?<\/a>/g,
  ],
  hydrationTimeout: 2000,
  needsHydrationCheck: false,
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (host.includes('thinkific.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (pathname.includes('/images/') || IMG_EXTS.includes(ext)) return 'assets/images';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.json') return 'data';
      return 'assets/misc';
    }
    if (host.includes('s3.amazonaws.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      return 'assets/misc';
    }
    return null;
  },
};
