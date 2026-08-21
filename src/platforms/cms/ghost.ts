import type { PlatformHandler } from '../types.js';
const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];
export const ghost: PlatformHandler = {
  name: 'ghost',
  displayName: 'Ghost',
  category: 'cms',
  priority: 78,
  detectByUrl(url: string): boolean {
    return /\.ghost\.io/i.test(url);
  },
  detectByHtml(html: string): boolean {
    return (
      html.includes('/assets/built/screen.css') ||
      html.includes('/public/cards.min.css') ||
      html.includes('cdn.jsdelivr.net/ghost/') ||
      html.includes('gh-powered-by')
    );
  },
  detectGenerator: /Ghost [0-9.]+/i,
  stripDomains: [],
  stripSelectors: [],
  stripPatterns: [
    /<div[^>]*class="[^"]*gh-powered-by[^"]*"[^>]*>[\s\S]*?<\/div>/g,
    /<a[^>]*href="[^"]*ghost\.org[^"]*"[^>]*>[\s\S]*?<\/a>/g,
    /<meta[^>]*name="generator"[^>]*content="Ghost[^"]*"[^>]*>/gi,
  ],
  hydrationTimeout: 0,
  needsHydrationCheck: false,
  scrollStrategy: 'paginated',
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (host.includes('storage.ghost.io')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (pathname.includes('/images/') || IMG_EXTS.includes(ext)) return 'assets/images';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      return 'assets/misc';
    }
    if (host.includes('cdn.jsdelivr.net')) {
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (ext === '.css') return 'styles';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      return 'assets/misc';
    }
    return null;
  },
};
