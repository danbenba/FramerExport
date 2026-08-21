import type { PlatformHandler } from '../types.js';
const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];
const STATIC_EDGE_RE = /^static\d+\.squarespace\.com$/i;
export const squarespace: PlatformHandler = {
  name: 'squarespace',
  displayName: 'Squarespace',
  category: 'builder',
  priority: 82,
  detectByUrl(url: string): boolean {
    return /\.squarespace\.com/i.test(url);
  },
  detectByHtml(html: string): boolean {
    return (
      html.includes('<!-- This is Squarespace. -->') ||
      html.includes('Static.SQUARESPACE_CONTEXT') ||
      html.includes('<!-- End of Squarespace Headers -->') ||
      html.includes('images.squarespace-cdn.com')
    );
  },
  stripDomains: [],
  stripSelectors: [],
  stripPatterns: [],
  hydrationTimeout: 3000,
  needsHydrationCheck: false,
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (host.includes('images.squarespace-cdn.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.json') return 'data';
      return 'assets/images';
    }
    if (host.includes('file.squarespace-cdn.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.json') return 'data';
      return 'assets/misc';
    }
    if (host.includes('assets.squarespace.com') || STATIC_EDGE_RE.test(host)) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.json') return 'data';
      if (IMG_EXTS.includes(ext) || pathname.includes('/images/')) return 'assets/images';
      return 'assets/misc';
    }
    if (host.includes('definitions.sqspcdn.com')) {
      if (ext === '.json') return 'data';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      return 'assets/misc';
    }
    return null;
  },
};
