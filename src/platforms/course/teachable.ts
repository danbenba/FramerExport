import type { PlatformHandler } from '../types.js';
const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];
export const teachable: PlatformHandler = {
  name: 'teachable',
  displayName: 'Teachable',
  category: 'course',
  priority: 82,
  detectByUrl(url: string): boolean {
    return /\.teachable\.com/i.test(url);
  },
  detectByHtml(html: string): boolean {
    return (
      html.includes('teachablecdn.com') ||
      html.includes('eventable.internal.teachable.com') ||
      html.includes('Teach Online with') ||
      html.includes('src=school_footer')
    );
  },
  stripDomains: [
    'cdn.heapanalytics.com',
    'bam.nr-data.net',
    'www.recaptcha.net',
    'fast.wistia.com',
  ],
  stripSelectors: ['script[src*="heapanalytics.com"]', 'script[src*="nr-data.net"]'],
  stripPatterns: [
    /<a[^>]*class=['"][^'"]*powered-by[^'"]*['"][^>]*>[\s\S]*?<\/a>/gi,
    /<a[^>]*href=['"][^'"]*teachable\.com[^'"]*src=school_footer[^'"]*['"][^>]*>[\s\S]*?<\/a>/gi,
  ],
  hydrationTimeout: 0,
  needsHydrationCheck: false,
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (host.includes('teachablecdn.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (ext === '.json') return 'data';
      if (pathname.includes('/images/')) return 'assets/images';
      if (pathname.includes('/packs/')) return 'scripts/vendor';
      return 'assets/misc';
    }
    return null;
  },
};
