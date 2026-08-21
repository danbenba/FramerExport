import type { PlatformHandler } from '../types.js';
const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];
export const elementor: PlatformHandler = {
  name: 'elementor',
  displayName: 'Elementor',
  category: 'landing',
  priority: 42,
  detectByUrl(url: string): boolean {
    return /\.elementor\.cloud/i.test(url);
  },
  detectByHtml(html: string): boolean {
    return (
      html.includes('/wp-content/plugins/elementor/') ||
      html.includes('elementor-kit-') ||
      html.includes('data-elementor-type=') ||
      html.includes('elementorFrontendConfig')
    );
  },
  detectGenerator: /^Elementor\s+\d+\.\d+/i,
  stripDomains: [],
  stripSelectors: [],
  stripPatterns: [],
  hydrationTimeout: 0,
  needsHydrationCheck: false,
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (!pathname.includes('/wp-content/') && !pathname.includes('/wp-includes/')) {
      return null;
    }
    if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
    if (ext === '.css') return 'styles';
    if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
    if (FONT_EXTS.includes(ext)) return 'assets/fonts';
    if (IMG_EXTS.includes(ext)) return 'assets/images';
    if (ext === '.json') return 'data';
    return 'assets/misc';
  },
};
