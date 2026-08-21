import type { PlatformHandler } from '../types.js';
const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];
export const duda: PlatformHandler = {
  name: 'duda',
  displayName: 'Duda',
  category: 'builder',
  priority: 82,
  detectByUrl(url: string): boolean {
    return /\.(?:multiscreensite|dudaone)\.com/i.test(url);
  },
  detectByHtml(html: string): boolean {
    return (
      html.includes("atob('RFVEQU9ORQ==')") ||
      html.includes('id="dmRoot"') ||
      html.includes('DM_DIRECT') ||
      html.includes('d_track_campaign')
    );
  },
  stripDomains: [],
  stripSelectors: ['#d_track_campaign', '#d_track_personalization', '#d_track_sp'],
  stripPatterns: [/<a[^>]*href="[^"]*duda\.co\/inspiration[^"]*"[^>]*>[\s\S]*?<\/a>/g],
  hydrationTimeout: 0,
  needsHydrationCheck: false,
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    const isCdnWebsite = host.endsWith('.cdn-website.com');
    const isMsCdn = host === 'ms-cdn.multiscreensite.com' || host === 'irp-cdn.multiscreensite.com';
    if (!isCdnWebsite && !isMsCdn) return null;
    if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
    if (IMG_EXTS.includes(ext) || pathname.includes('/images/')) return 'assets/images';
    if (ext === '.css') return 'styles';
    if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
    if (FONT_EXTS.includes(ext)) return 'assets/fonts';
    const isResizeProxy = host.startsWith('irp') || host.startsWith('lirp');
    return isResizeProxy ? 'assets/images' : 'assets/misc';
  },
};
