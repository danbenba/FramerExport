import type { PlatformHandler } from '../types.js';

/**
 * Gamma (gamma.app) — AI presentation / site builder.
 *
 * Verified signatures (tests/research/gamma.json):
 *   - URL:   *.gamma.site (free tier); Pro sites use custom domains.
 *   - HTML:  Next.js SSR app — `<div id="__next">`, `<script id="__NEXT_DATA__">`,
 *            ProseMirror/TipTap node-view markup (data-node-view-wrapper,
 *            gamma-moveable-wrapper), Chakra-UI/emotion classes.
 *   - Assets: JS/CSS chunks on assets.gammahosted.com/<siteId>/_next/static/,
 *            user media on cdn.gamma.app wrapped through imgproxy.gamma.app,
 *            OG/preview screenshots on assets.api.gamma.app/<siteId>/screenshots/.
 *   - Header X-Super-Powered-By: gamma is the strongest tell but is invisible to
 *     detectByHtml, so we lean on the unique asset hosts + Gamma-only class,
 *     which also catch Pro custom-domain sites (assets.gammahosted.com).
 *
 * renderStrategy is "hybrid": content is server-rendered then React/Chakra
 * hydrated, so the SSR body already carries the content — captureRenderedDom is
 * intentionally NOT set (per authoring guide, true only for spa/react-hydration).
 * No "Made with Gamma" site badge exists on published sites (toggleable /
 * export-watermark only), and no analytics hosts were observed, so all strip
 * fields stay empty.
 */

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
    // Gamma-unique asset hosts + node-view class. Deliberately avoids generic
    // Next.js markers (#__next, __NEXT_DATA__) that appear on unrelated sites.
    return (
      html.includes('assets.gammahosted.com') ||
      html.includes('imgproxy.gamma.app') ||
      html.includes('cdn.gamma.app') ||
      html.includes('gamma-moveable-wrapper')
    );
  },

  // No telemetry/analytics hosts observed in the profile.
  stripDomains: [],

  // No site badge and no editor chrome to strip on published Gamma sites.
  stripSelectors: [],
  stripPatterns: [],

  hydrationTimeout: 8000,
  needsHydrationCheck: true,
  hydrationSelector: '#__next',
  scrollStrategy: 'standard',

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    // Next.js build output: JS/CSS chunks, fonts, static images under _next/static.
    if (host.includes('assets.gammahosted.com')) {
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (ext === '.json') return 'data';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      return 'assets/misc';
    }

    // Image resize proxy — every URL resolves to an image regardless of ext.
    if (host.includes('imgproxy.gamma.app')) {
      return 'assets/images';
    }

    // OG / social-preview screenshots.
    if (host.includes('assets.api.gamma.app')) {
      return 'assets/images';
    }

    // Raw user media (original / optimized) — mostly images, some video.
    if (host.includes('cdn.gamma.app')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      // cdn.gamma.app is a media host; default unknown ext to images.
      return 'assets/images';
    }

    return null;
  },
};
