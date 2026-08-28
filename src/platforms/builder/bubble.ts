import type { PlatformHandler } from '../types.js';
const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];
export const bubble: PlatformHandler = {
  name: 'bubble',
  displayName: 'Bubble',
  category: 'builder',
  priority: 85,
  detectByUrl(url: string): boolean {
    return /\.bubbleapps\.io/i.test(url);
  },
  detectByHtml(html: string): boolean {
    return (
      html.includes('window.appquery = make_proxy(') ||
      html.includes('window._bubble_page_load_data') ||
      html.includes('window.bubble_session_uid') ||
      html.includes('/package/pre_run_jquery_js/')
    );
  },
  stripDomains: ['pluginpul.se'],
  stripSelectors: ['script[src*="pluginpul.se"]'],
  stripPatterns: [
    /<a\b[^>]*href="https?:\/\/(?:www\.)?bubble\.io\/?(?:\?[^"]*)?"[^>]*>[\s\S]*?<\/a>/gi,
  ],
  needsHydrationCheck: true,
  hydrationTimeout: 8000,
  hydrationSelector: '#main-page',
  captureRenderedDom: true,
  postCapture(html: string): string {
    html = html.replace(
      /<div style="[^"]*z-index: 100000000000[^"]*">[\s\S]*?Built on Bubble<\/div><\/div><\/div><\/div>/gi,
      ''
    );
    html = html.replace(
      /<script\b(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi,
      ''
    );
    return html;
  },
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (host.includes('meta-fonts.cdn.bubble.io')) {
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.css') return 'styles';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      return 'assets/misc';
    }
    if (host.includes('cdn.bubble.io')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (pathname.includes('/images/') || IMG_EXTS.includes(ext)) return 'assets/images';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.json') return 'data';
      return 'assets/misc';
    }
    if (
      host.includes('d3dqmih97rcqmh.cloudfront.net') ||
      host.includes('d1muf25xaso8hp.cloudfront.net')
    ) {
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (ext === '.css') return 'styles';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      if (ext === '.json') return 'data';
      return 'assets/misc';
    }
    return null;
  },
};
