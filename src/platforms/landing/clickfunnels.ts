import type { PlatformHandler } from '../types.js';
const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];
export const clickfunnels: PlatformHandler = {
  name: 'clickfunnels',
  displayName: 'ClickFunnels (2.0 / "CF2")',
  category: 'landing',
  priority: 82,
  detectByUrl(url: string): boolean {
    return /\.myclickfunnels\.com/i.test(url);
  },
  detectByHtml(html: string): boolean {
    return (
      html.includes('cf-head-scripts') ||
      html.includes('window.cfRootDomain') ||
      html.includes('cf-lander-serialized-custom-fonts') ||
      html.includes('data-page-element')
    );
  },
  stripDomains: ['bam.nr-data.net', 'js-agent.newrelic.com', 'events.myclickfunnels.com'],
  stripSelectors: [],
  stripPatterns: [],
  hydrationTimeout: 0,
  needsHydrationCheck: false,
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (host.includes('statics.myclickfunnels.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (pathname.includes('/image/') || pathname.includes('/images/') || IMG_EXTS.includes(ext))
        return 'assets/images';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/misc';
    }
    if (host.includes('images.clickfunnels.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/images';
    }
    return null;
  },
};
