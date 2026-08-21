import type { PlatformHandler } from '../types.js';
const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];
export const carrd: PlatformHandler = {
  name: 'carrd',
  displayName: 'Carrd',
  category: 'builder',
  priority: 85,
  detectByUrl(url: string): boolean {
    return /\.carrd\.co/i.test(url);
  },
  detectByHtml(html: string): boolean {
    return (
      html.includes("$inner = $('.inner')") ||
      html.includes('href="https://carrd.co"') ||
      /class="[^"]*\b(?:text|image|container|buttons|icons|divider|links)-component\b/.test(html) ||
      (html.includes('class="site-wrapper"') && html.includes('class="site-main"'))
    );
  },
  stripDomains: [],
  stripSelectors: ['#credits'],
  stripPatterns: [
    /<p[^>]*id="credits"[^>]*>[\s\S]*?<\/p>/gi,
    /<a[^>]*href="https:\/\/carrd\.co"[^>]*>\s*\(\s*Made with Carrd\s*\)\s*<\/a>/gi,
  ],
  hydrationTimeout: 2000,
  needsHydrationCheck: false,
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (host.includes('fonts.googleapis.com')) {
      return 'styles';
    }
    if (host.includes('carrd.co')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (pathname.includes('/assets/images/') || IMG_EXTS.includes(ext)) return 'assets/images';
      if (pathname.includes('/assets/css/') || ext === '.css') return 'styles';
      if (pathname.includes('/assets/js/') || ext === '.js' || ext === '.mjs')
        return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/misc';
    }
    return null;
  },
};
