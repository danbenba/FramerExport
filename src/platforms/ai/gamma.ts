import type { PlatformHandler } from '../types.js';
const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];
export const gamma: PlatformHandler = {
  name: 'gamma',
  displayName: 'Gamma',
  category: 'ai',
  priority: 85,
  detectByUrl(url: string): boolean {
    return /\.gamma\.site/i.test(url);
  },
  detectByHtml(html: string): boolean {
    return (
      html.includes('assets.gammahosted.com') ||
      html.includes('imgproxy.gamma.app') ||
      html.includes('cdn.gamma.app') ||
      html.includes('gamma-moveable-wrapper')
    );
  },
  stripDomains: [],
  stripSelectors: [],
  stripPatterns: [],
  hydrationTimeout: 8000,
  needsHydrationCheck: true,
  hydrationSelector: '#__next',
  scrollStrategy: 'standard',
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (host.includes('assets.gammahosted.com')) {
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (ext === '.json') return 'data';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      return 'assets/misc';
    }
    if (host.includes('imgproxy.gamma.app')) {
      return 'assets/images';
    }
    if (host.includes('assets.api.gamma.app')) {
      return 'assets/images';
    }
    if (host.includes('cdn.gamma.app')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      return 'assets/images';
    }
    return null;
  },
};
