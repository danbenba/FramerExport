import type { PlatformHandler } from '../types.js';
const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];
export const weebly: PlatformHandler = {
  name: 'weebly',
  displayName: 'Weebly',
  category: 'builder',
  priority: 82,
  detectByUrl(url: string): boolean {
    return /\.weebly\.com/i.test(url);
  },
  detectByHtml(html: string): boolean {
    return (
      html.includes('Weebly.footer.setupContainer') ||
      html.includes('weebly-footer-signup-container-v3') ||
      html.includes('wsite-content') ||
      html.includes('window._W')
    );
  },
  stripDomains: ['google-analytics.com'],
  stripSelectors: ['#weebly-footer-signup-container-v3', 'script[src*="footerSignup.js"]'],
  stripPatterns: [/<a[^>]*href="[^"]*weebly\.com\/signup[^"]*"[^>]*>[\s\S]*?<\/a>/g],
  hydrationTimeout: 0,
  needsHydrationCheck: false,
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (host.includes('editmysite.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (pathname.includes('/images/') || IMG_EXTS.includes(ext)) return 'assets/images';
      if (pathname.includes('/css/') || ext === '.css') return 'styles';
      if (pathname.includes('/js/') || ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/misc';
    }
    return null;
  },
};
