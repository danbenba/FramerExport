import type { PlatformHandler } from '../types.js';

/**
 * Tilda — v5 handler (verified, high confidence).
 *
 * PlatformHandler: name/displayName/category/priority + detectByUrl(url:string),
 * detectByHtml(html:string), mapAssetDir(host,pathname,ext) → folder|null.
 *
 * Verified against two independent real Tilda HTML sources (bioinf.me project
 * 29135 and spbnodejs.org project 87822 GitHub backups) plus a live .pro-hosted
 * render. Pages are fully server-rendered (renderStrategy: ssr-static) — we mirror
 * the raw HTML, so NO rendered-DOM capture is needed. There is NO
 * `<meta name="generator">` on Tilda output, so there is no `detectGenerator`.
 *
 * Detection: the `*.tilda.ws` free-hosting subdomain is unambiguous (URL match);
 * paid custom-domain sites are recognised only by the tildacdn asset hosts and the
 * `t-body` / `allrecords` / `data-tilda-*` markup, so detectByHtml leans on those.
 *
 * Badge: the "Made on Tilda" label is `<div id="tildacopy" class="t-tildalabel"
 * data-tilda-sign="PROJECTID#PAGEID"><a href="https://tilda.cc/?upm=<projectId>">…`
 * — present on free-plan sites, absent on white-label/paid plans. Removed via the
 * `#tildacopy` / `.t-tildalabel` selectors plus a tilda.cc anchor stripPattern.
 *
 * Telemetry: Google Analytics (www.google-analytics.com) is blocked at the domain
 * level; the Tilda stat script lives ON the asset CDN (static.tildacdn.com/js/
 * tilda-stat-*.js), so it is removed by a `script[src*="tilda-stat"]` selector
 * rather than by blocking the CDN host (which would delete needed assets).
 */

const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];

export const tilda: PlatformHandler = {
  name: 'tilda',
  displayName: 'Tilda',
  category: 'builder',
  priority: 80,

  detectByUrl(url: string): boolean {
    return /\.tilda\.ws/i.test(url);
  },

  detectByHtml(html: string): boolean {
    return (
      html.includes('data-tilda-project-id') ||
      html.includes('data-tilda-page-id') ||
      html.includes('tildacdn') ||
      html.includes('id="allrecords"')
    );
  },

  // Third-party telemetry only. NEVER the tildacdn asset hosts (they carry the
  // page's real images/CSS/JS); the Tilda stat script is stripped by selector.
  stripDomains: ['www.google-analytics.com', 'google-analytics.com'],

  stripSelectors: ['#tildacopy', '.t-tildalabel', 'script[src*="tilda-stat"]'],

  stripPatterns: [
    // "Made on Tilda" badge link (free-plan only). No nested <a>, so the
    // non-greedy </a> match is safe even though the anchor wraps inner <div>s.
    /<a[^>]*href="[^"]*tilda\.cc[^"]*"[^>]*>[\s\S]*?<\/a>/g,
  ],

  hydrationTimeout: 0,
  needsHydrationCheck: false,

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    // Covers static/ws/neo/thb .tildacdn.com and .tildacdn.pro edges.
    if (host.includes('tildacdn')) {
      // Thumbnail edges (thb.tildacdn.*) only serve resized imagery, frequently
      // with a /-/resize/ suffix and no real file extension.
      if (host.startsWith('thb.')) return 'assets/images';

      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (ext === '.css' || pathname.includes('/css/')) return 'styles';
      if (ext === '.js' || ext === '.mjs' || pathname.includes('/js/')) return 'scripts/vendor';
      if (FONT_EXTS.includes(ext) || pathname.includes('/fonts/')) return 'assets/fonts';
      if (ext === '.json') return 'data';
      if (
        IMG_EXTS.includes(ext) ||
        pathname.includes('/img/') ||
        pathname.includes('/images/') ||
        pathname.includes('/tild')
      ) {
        return 'assets/images';
      }
      return 'assets/misc';
    }

    return null;
  },
};
