import type { PlatformHandler } from '../types.js';
const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];
export const wordpress: PlatformHandler = {
  name: 'wordpress',
  displayName: 'WordPress',
  category: 'cms',
  priority: 40,
  detectByUrl(url: string): boolean {
    return /\.wordpress\.com|\/wp-(content|includes|json)\//i.test(url);
  },
  detectByHtml(html: string): boolean {
    return (
      html.includes('/wp-includes/') ||
      html.includes('/wp-content/') ||
      html.includes('api.w.org') ||
      html.includes('_wpemojiSettings')
    );
  },
  detectGenerator: /WordPress/i,
  stripDomains: ['stats.wp.com', 'pixel.wp.com'],
  stripSelectors: ['script[src*="stats.wp.com"]', 'script[src*="pixel.wp.com"]'],
  stripPatterns: [
    /<meta[^>]*name=["']generator["'][^>]*content=["'][^"']*WordPress[^"']*["'][^>]*>/gi,
  ],
  hydrationTimeout: 0,
  needsHydrationCheck: false,
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (host.includes('i0.wp.com') || host.includes('i1.wp.com') || host.includes('i2.wp.com')) {
      return 'assets/images';
    }
    if (host.includes('gravatar.com')) {
      return 'assets/images';
    }
    if (host.includes('fonts.wp.com')) {
      if (ext === '.css') return 'styles';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      return 'assets/fonts';
    }
    if (
      host.includes('s0.wp.com') ||
      host.includes('s1.wp.com') ||
      host.includes('s2.wp.com') ||
      host.includes('c0.wp.com') ||
      host.includes('s.w.org')
    ) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext) || pathname.includes('/images/')) return 'assets/images';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/misc';
    }
    return null;
  },
};
