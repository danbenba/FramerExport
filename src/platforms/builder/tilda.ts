import type { PlatformHandler } from '../types.js';
const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];
export const tilda: PlatformHandler = {
  name: 'tilda',
  displayName: 'Tilda',
  category: 'builder',
  priority: 80,
  detectByUrl(url: string): boolean {
    return /\.tilda\.ws/i.test(url);
  },
  detectByHtml(html: string): boolean {
    return (
      html.includes('data-tilda-project-id') ||
      html.includes('data-tilda-page-id') ||
      html.includes('tildacdn') ||
      html.includes('id="allrecords"')
    );
  },
  stripDomains: ['www.google-analytics.com', 'google-analytics.com'],
  stripSelectors: ['#tildacopy', '.t-tildalabel', 'script[src*="tilda-stat"]'],
  stripPatterns: [/<a[^>]*href="[^"]*tilda\.cc[^"]*"[^>]*>[\s\S]*?<\/a>/g],
  hydrationTimeout: 0,
  needsHydrationCheck: false,
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (host.includes('tildacdn')) {
      if (host.startsWith('thb.')) return 'assets/images';
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (ext === '.css' || pathname.includes('/css/')) return 'styles';
      if (ext === '.js' || ext === '.mjs' || pathname.includes('/js/')) return 'scripts/vendor';
      if (FONT_EXTS.includes(ext) || pathname.includes('/fonts/')) return 'assets/fonts';
      if (ext === '.json') return 'data';
      if (
        IMG_EXTS.includes(ext) ||
        pathname.includes('/img/') ||
        pathname.includes('/images/') ||
        pathname.includes('/tild')
      ) {
        return 'assets/images';
      }
      return 'assets/misc';
    }
    return null;
  },
};
