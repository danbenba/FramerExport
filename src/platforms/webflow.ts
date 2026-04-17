import type { PlatformHandler } from './types.js';

const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];

export const webflow: PlatformHandler = {
  name: 'webflow',
  displayName: 'Webflow',

  detectByUrl(url: string): boolean {
    return /\.webflow\.(io|com)/.test(url);
  },

  detectByHtml(html: string): boolean {
    return (
      html.includes('data-wf-site') ||
      html.includes('w-webflow-badge') ||
      html.includes('Webflow') ||
      html.includes('webflow.js')
    );
  },

  stripDomains: ['js-agent.newrelic.com', 'cdn.heapanalytics.com', 'tr.snapchat.com'],

  stripSelectors: ['.w-webflow-badge', 'link[href*="editorbar"]'],

  stripPatterns: [
    /<a[^>]*class="[^"]*w-webflow-badge[^"]*"[^>]*>[\s\S]*?<\/a>/g,
    /<a[^>]*href="[^"]*webflow\.com\?utm_campaign=brandjs[^"]*"[^>]*>[\s\S]*?<\/a>/g,
    /<style>[^<]*\.w-webflow-badge[^<]*<\/style>/g,
  ],

  hydrationTimeout: 2000,
  needsHydrationCheck: false,

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (
      host.includes('website-files.com') ||
      host.includes('webflow.com') ||
      host.includes('uploads-ssl.webflow.com')
    ) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (pathname.includes('/images/') || IMG_EXTS.includes(ext)) return 'assets/images';
      if (pathname.includes('/css/') || ext === '.css') return 'styles';
      if (pathname.includes('/js/') || ext === '.js') return 'scripts/vendor';
      if (pathname.includes('/gsap/') || pathname.includes('/plugins/')) return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/misc';
    }

    if (host.includes('d3e54v103j8qbb.cloudfront.net')) {
      if (ext === '.js') return 'scripts/vendor';
      if (ext === '.css') return 'styles';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      return 'assets/misc';
    }

    return null;
  },
};
