import type { PlatformHandler } from '../types.js';
const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];
export const kajabi: PlatformHandler = {
  name: 'kajabi',
  displayName: 'Kajabi',
  category: 'course',
  priority: 85,
  detectByUrl(url: string): boolean {
    return /\.mykajabi\.com/i.test(url);
  },
  detectByHtml(html: string): boolean {
    return (
      html.includes('var Kajabi = Kajabi') ||
      html.includes('Kajabi.currentSiteUser') ||
      html.includes('kjb-settings-id=') ||
      html.includes('kajabi-cdn.com')
    );
  },
  stripDomains: ['rs-dp.kajabi.com', 'cdn.rudderlabs.com'],
  stripSelectors: ['.footer__powered-by'],
  stripPatterns: [
    /<div[^>]*class="[^"]*footer__powered-by[^"]*"[^>]*>[\s\S]*?<\/div>/g,
    /<a[^>]*href="[^"]*app\.kajabi\.com\/r\/[^"]*powered_by=true[^"]*"[^>]*>[\s\S]*?<\/a>/g,
  ],
  hydrationTimeout: 2000,
  needsHydrationCheck: false,
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (host.includes('kajabi-cdn.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (pathname.includes('/images/') || IMG_EXTS.includes(ext)) return 'assets/images';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.json') return 'data';
      return 'assets/misc';
    }
    return null;
  },
};
