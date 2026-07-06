import type { PlatformHandler } from '../types.js';

/**
 * ClickFunnels 2.0 ("CF2") — v5 production handler.
 *
 * Server-rendered Rails/Shakapacker landing pages. Detection, stripping and
 * asset mapping were verified against raw HTML of academy.myclickfunnels.com
 * and www.clickfunnels.com (both 200 OK, no anti-bot interstitial, ssr-static).
 *
 * PlatformHandler signatures (see src/platforms/types.ts):
 *   detectByUrl(url): boolean
 *   detectByHtml(html): boolean
 *   mapAssetDir(host, pathname, ext): string | null
 *
 * Strongest tells (all confirmed verbatim on both samples):
 *   - inline <script id="cf-head-scripts"> defining window.cfRootDomain
 *   - the cf-lander-* serialized script ids
 *   - the pervasive data-page-element attribute (655/1772 occurrences)
 *   - root div class="pageRoot id-<token>" inside elPageContentWrapper.
 *
 * Assets live on statics.myclickfunnels.com + images.clickfunnels.com (localize).
 * events.myclickfunnels.com is a telemetry beacon (NOT a CDN) — blocked, not mapped.
 */

const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];

export const clickfunnels: PlatformHandler = {
  name: 'clickfunnels',
  displayName: 'ClickFunnels (2.0 / "CF2")',
  category: 'landing',
  priority: 82,

  detectByUrl(url: string): boolean {
    // Default workspace subdomains (e.g. academy.myclickfunnels.com). Custom-domain
    // funnels are not caught here and must rely on the HTML signatures below.
    return /\.myclickfunnels\.com/i.test(url);
  },

  detectByHtml(html: string): boolean {
    // OR the four most distinctive, stable CF2 markers. Each is unique to the
    // ClickFunnels renderer and does not appear on Framer/Webflow/Wix pages.
    return (
      html.includes('cf-head-scripts') ||
      html.includes('window.cfRootDomain') ||
      html.includes('cf-lander-serialized-custom-fonts') ||
      html.includes('data-page-element')
    );
  },

  // Telemetry / analytics hosts blocked during capture. NOT the asset CDNs
  // (statics.myclickfunnels.com / images.clickfunnels.com) and NOT the functional
  // third-party libs (cdnjs / code.jquery.com / fontawesome) or Turnstile.
  stripDomains: ['bam.nr-data.net', 'js-agent.newrelic.com', 'events.myclickfunnels.com'],

  // No CF-specific badge/editor container has a static id/class in the delivered
  // HTML, so there is nothing selector-strippable here.
  stripSelectors: [],

  // BADGE: The "Powered by ClickFunnels" badge is default-on per docs but was
  // toggled OFF/HIDDEN on both verified samples (0 occurrences in the SSR HTML),
  // and this handler does not capture the rendered DOM. No reliable static markup
  // exists to anchor a regex on, so no badge stripPattern is emitted (a loose match
  // on clickfunnels.com would risk removing legitimate links). If a future sample
  // exposes the badge anchor, add a tight /<a[^>]*href="[^"]*clickfunnels\.com[^"]*"...>/ here.
  stripPatterns: [],

  // ssr-static: SSR body is complete, no hydration wait needed.
  hydrationTimeout: 0,
  needsHydrationCheck: false,

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    // Primary asset CDN: statics.myclickfunnels.com serves images
    // (/image/<id>/file/<md5>.<ext>), css, js and fonts.
    if (host.includes('statics.myclickfunnels.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (pathname.includes('/image/') || pathname.includes('/images/') || IMG_EXTS.includes(ext))
        return 'assets/images';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/misc';
    }

    // Image-only CDN.
    if (host.includes('images.clickfunnels.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      // Everything else on this host is imagery (bare-path transforms included).
      return 'assets/images';
    }

    // Foreign host — let the generic fallback handle it.
    return null;
  },
};
