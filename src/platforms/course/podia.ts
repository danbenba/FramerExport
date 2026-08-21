import type { PlatformHandler } from '../types.js';
const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];
export const podia: PlatformHandler = {
  name: 'podia',
  displayName: 'Podia',
  category: 'course',
  priority: 80,
  detectByUrl(url: string): boolean {
    return /\.podia\.com/i.test(url);
  },
  detectByHtml(html: string): boolean {
    return (
      html.includes('0x4AAAAAAAJ5kwYW6AH1ybLx') ||
      html.includes('cdn.podia.com') ||
      html.includes('data-react-component="creator_ui/section_adapters/') ||
      html.includes('data-controller="editor--page-section"')
    );
  },
  stripDomains: ['www.googletagmanager.com'],
  stripSelectors: ['script[src*="googletagmanager.com"]'],
  stripPatterns: [
    /<a[^>]*href=['"][^'"]*podia\.com[^'"]*utm_medium=poweredby[^'"]*['"][^>]*>[\s\S]*?<\/a>/gi,
  ],
  hydrationTimeout: 4000,
  needsHydrationCheck: true,
  hydrationSelector: '.react-page-section',
  captureRenderedDom: true,
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (host.includes('cdn.podia.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (IMG_EXTS.includes(ext) || pathname.includes('/images/')) return 'assets/images';
      return 'assets/misc';
    }
    if (host.includes('.podia.com') && pathname.includes('/content-assets/')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/misc';
    }
    return null;
  },
};
