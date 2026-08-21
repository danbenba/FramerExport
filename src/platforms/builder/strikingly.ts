import type { PlatformHandler } from '../types.js';
const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];
export const strikingly: PlatformHandler = {
  name: 'strikingly',
  displayName: 'Strikingly',
  category: 'builder',
  priority: 85,
  detectByUrl(url: string): boolean {
    return /\.mystrikingly\.com/i.test(url);
  },
  detectByHtml(html: string): boolean {
    return (
      html.includes('strikingly-host-suffix') ||
      html.includes('data-hypernova-key="SiteBootstrapper"') ||
      html.includes('id="s-page-client-container"') ||
      html.includes('strikinglycdn.com')
    );
  },
  stripDomains: [
    'google-analytics.com',
    'www.google-analytics.com',
    'notify.bugsnag.com',
    'sessions.bugsnag.com',
  ],
  stripSelectors: ['.show-strikingly-logo'],
  stripPatterns: [/<a[^>]*href="[^"]*strikingly\.com\/\?ref=logo[^"]*"[^>]*>[\s\S]*?<\/a>/gi],
  hydrationTimeout: 3000,
  needsHydrationCheck: false,
  hydrationSelector: '#s-page-client-container',
  captureRenderedDom: true,
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (host.includes('strikinglycdn.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (host.includes('static-fonts-css')) {
        if (FONT_EXTS.includes(ext)) return 'assets/fonts';
        if (ext === '.css') return 'styles';
      }
      if (host.includes('static-assets')) {
        if (ext === '.css') return 'styles';
        if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
        if (FONT_EXTS.includes(ext)) return 'assets/fonts';
        if (IMG_EXTS.includes(ext) || pathname.includes('/images/')) return 'assets/images';
        return 'assets/misc';
      }
      if (IMG_EXTS.includes(ext) || pathname.includes('/images/')) return 'assets/images';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      return 'assets/misc';
    }
    if (host.includes('cdnjs.cloudflare.com')) {
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (ext === '.css') return 'styles';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      return 'assets/misc';
    }
    return null;
  },
};
