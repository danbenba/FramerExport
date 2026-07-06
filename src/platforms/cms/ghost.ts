import type { PlatformHandler } from '../types.js';

/**
 * Ghost (open-source publishing / CMS) handler.
 *
 * PlatformHandler shape (see ../types.ts):
 *   detectByUrl(url: string): boolean
 *   detectByHtml(html: string): boolean
 *   detectGenerator?: RegExp                // tested against <meta name="generator"> content
 *   mapAssetDir(host: string, pathname: string, ext: string): string | null
 *
 * Verified against live raw HTML from demo.ghost.io (Ghost Pro, generator
 * "Ghost 6.51") and self-hosted spreadprivacy.com (generator "Ghost 6.39"):
 *  - Render is ssr-static: the full post-card feed and article bodies ship in the
 *    server HTML. Portal / sodo-search / comments / stats are deferred iframe
 *    add-ons that do not gate content — so no rendered-DOM capture is needed.
 *  - Generator string "Ghost X.Y" + the cdn.jsdelivr.net/ghost/ script path is the
 *    definitive combined fingerprint; the literal version drifts between sites, so
 *    detectGenerator matches /Ghost [0-9.]+/, not a fixed version.
 *  - Analytics (/public/ghost-stats.min.js) is first-party (POSTs to the site's own
 *    /.ghost/analytics/), so there is no third-party telemetry host to block.
 *  - The gh-powered-by badge and Portal script are optional (absent when membership
 *    is off), so they are used only as extra OR'd detection signals, never alone.
 */

const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];

export const ghost: PlatformHandler = {
  name: 'ghost',
  displayName: 'Ghost',
  category: 'cms',
  priority: 78,

  detectByUrl(url: string): boolean {
    return /\.ghost\.io/i.test(url);
  },

  detectByHtml(html: string): boolean {
    return (
      html.includes('/assets/built/screen.css') ||
      html.includes('/public/cards.min.css') ||
      html.includes('cdn.jsdelivr.net/ghost/') ||
      html.includes('gh-powered-by')
    );
  },

  // Matched against <meta name="generator"> content only. Version drifts per site
  // (observed 6.51 and 6.39), so match the pattern rather than a literal version.
  detectGenerator: /Ghost [0-9.]+/i,

  // First-party ghost-stats is the only analytics; it POSTs to the site's own
  // origin, so there is no third-party telemetry host to block during capture.
  stripDomains: [],

  // The "Powered by Ghost" badge's unique class sits on the WRAPPER <div>, whose
  // only child is the <a>. The post-processor's naive `.class` stripper is
  // non-greedy to the first close tag, so `.gh-powered-by` would delete only up to
  // the inner </a> and orphan a dangling </div>. Since selectors run before
  // patterns, that orphan cannot be cleaned up afterwards. The badge is therefore
  // removed cleanly (both tags) by the wrapper-div stripPattern below instead.
  stripSelectors: [],

  stripPatterns: [
    // <div class="gh-powered-by"><a href="https://ghost.org/" ...>Powered by Ghost</a></div>
    /<div[^>]*class="[^"]*gh-powered-by[^"]*"[^>]*>[\s\S]*?<\/div>/g,
    // Bare <a href="…ghost.org…">Powered by Ghost</a> fallback if the wrapper drops.
    /<a[^>]*href="[^"]*ghost\.org[^"]*"[^>]*>[\s\S]*?<\/a>/g,
    // Identifying <meta name="generator" content="Ghost X.Y">.
    /<meta[^>]*name="generator"[^>]*content="Ghost[^"]*"[^>]*>/gi,
  ],

  hydrationTimeout: 0,
  needsHydrationCheck: false,
  scrollStrategy: 'paginated',

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    // Ghost Pro asset/image storage (images, and occasionally other media).
    if (host.includes('storage.ghost.io')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (pathname.includes('/images/') || IMG_EXTS.includes(ext)) return 'assets/images';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      return 'assets/misc';
    }

    // Ghost front-end packages (Portal, Sodo search, comments) served from jsDelivr
    // under /ghost/. Classify by extension.
    if (host.includes('cdn.jsdelivr.net')) {
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (ext === '.css') return 'styles';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      return 'assets/misc';
    }

    return null;
  },
};
