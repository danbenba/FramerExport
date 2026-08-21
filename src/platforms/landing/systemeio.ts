import type { PlatformHandler } from '../types.js';
const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];
export const systemeio: PlatformHandler = {
  name: 'systemeio',
  displayName: 'Systeme.io',
  category: 'landing',
  priority: 80,
  detectByUrl(url: string): boolean {
    return /\.systeme\.io/i.test(url);
  },
  detectByHtml(html: string): boolean {
    return (
      html.includes('<!-- Created with https://systeme.io -->') ||
      html.includes('d3fit27i5nzkqh.cloudfront.net') ||
      html.includes('systeme.io/?sa=') ||
      html.includes('d3syewzhvzylbl.cloudfront.net')
    );
  },
  stripDomains: ['log.systeme.io'],
  stripSelectors: ['script[src*="log.systeme.io"]'],
  stripPatterns: [
    /<a[^>]*href="[^"]*systeme\.io\/\?sa=[^"]*"[^>]*>[\s\S]*?<\/a>/g,
    /<!--\s*Created with https:\/\/systeme\.io\s*-->/g,
  ],
  hydrationTimeout: 0,
  needsHydrationCheck: false,
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (host.includes('d3fit27i5nzkqh.cloudfront.net')) {
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      if (ext === '.json') return 'data';
      return 'assets/misc';
    }
    if (host.includes('d3syewzhvzylbl.cloudfront.net')) {
      if (FONT_EXTS.includes(ext) || pathname.includes('/fonts/')) return 'assets/fonts';
      if (ext === '.css') return 'styles';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      return 'assets/misc';
    }
    if (host.includes('d1yei2z3i6k35z.cloudfront.net')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext) || pathname.includes('/images/')) return 'assets/images';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      return 'assets/misc';
    }
    if (host.includes('d2543nuuc0wvdg.cloudfront.net')) {
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
