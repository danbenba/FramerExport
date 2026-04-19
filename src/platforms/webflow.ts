import type { PlatformHandler } from './types.js';

const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];

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
      html.includes('Webflow')
    );
  },

  stripDomains: ['js-agent.newrelic.com', 'cdn.heapanalytics.com', 'tr.snapchat.com'],

  stripSelectors: ['.w-webflow-badge', 'link[href*="editorbar"]'],

  stripPatterns: [
    /<a[^>]*class="[^"]*w-webflow-badge[^"]*"[^>]*>[\s\S]*?<\/a>/g,
    /<a[^>]*href="[^"]*webflow\.com\?utm_campaign=brandjs[^"]*"[^>]*>[\s\S]*?<\/a>/g,
    /<style>[^<]*\.w-webflow-badge[^<]*<\/style>/g,
  ],

  hydrationTimeout: 1500,
  needsHydrationCheck: false,

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (
      host.includes('webflow.com') ||
      host.includes('website-files.com') ||
      host.includes('uploads-ssl.webflow.com')
    ) {
      if (pathname.includes('/images/') || IMG_EXTS.includes(ext)) return 'assets/images';
      if (ext === '.css') return 'styles';
      if (ext === '.js') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/misc';
    }

    if (host.includes('d3e54v103j8qbb.cloudfront.net')) {
      if (ext === '.js') return 'scripts/vendor';
      if (ext === '.css') return 'styles';
      return 'assets/misc';
    }

    if (host.includes('global-uploads.webflow.com')) {
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/misc';
    }

    return null;
  },
};
