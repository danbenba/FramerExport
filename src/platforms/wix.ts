import type { PlatformHandler } from './types.js';

const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];

export const wix: PlatformHandler = {
  name: 'wix',
  displayName: 'Wix',

  detectByUrl(url: string): boolean {
    return /\.wixsite\.com|\.wix\.com/.test(url);
  },

  detectByHtml(html: string): boolean {
    return (
      html.includes('wix-viewer-model') ||
      html.includes('id="WIX_ADS"') ||
      html.includes('X-Wix-') ||
      html.includes('Wix.com') ||
      html.includes('wixcode-sdk')
    );
  },

  stripDomains: [
    'frog.wix.com',
    'bi.wixapi.com',
    'fed.wixcodescheduler.com',
    'editor.wix.com',
    'panorama.wixapps.net',
  ],

  stripSelectors: ['#WIX_ADS', '.wix-ads', '#wix-badge', '#SCROLL_TO_TOP'],

  stripPatterns: [
    /<div[^>]*class="[^"]*wix-ads[^"]*"[^>]*>[\s\S]*?<\/div>/g,
  ],

  hydrationTimeout: 3000,
  needsHydrationCheck: false,

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (host === 'video.wixstatic.com') {
      return 'assets/videos';
    }

    if (host.includes('wixstatic.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (pathname.includes('/images/') || IMG_EXTS.includes(ext)) return 'assets/images';
      if (ext === '.css') return 'styles';
      if (ext === '.js') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/misc';
    }

    if (host.includes('parastorage.com')) {
      if (ext === '.js') return 'scripts/vendor';
      if (ext === '.css') return 'styles';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      return 'assets/misc';
    }

    return null;
  },
};
