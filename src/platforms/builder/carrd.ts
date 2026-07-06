import type { PlatformHandler } from '../types.js';

/**
 * Carrd — v5 production handler.
 *
 * Signatures (verified live across 5 reference sites):
 *   detectByUrl:   host matches \.carrd\.co (covers *.carrd.co and *.demo.carrd.co)
 *   detectByHtml:  inline IIFE runtime hallmark `$inner = $('.inner')`, the
 *                  `…-component` class scheme, the "( Made with Carrd )" badge
 *                  anchor, and the current-gen `.site-wrapper > .site-main` nesting
 *   badge:         free-plan <p id="credits"><a href="https://carrd.co">( Made with Carrd )</a></p>
 *   render:        ssr-static — full text/images live in the raw HTML; a `.deferred`
 *                  + @keyframes loading-spinner only fades content in, so no
 *                  hydration wait and no rendered-DOM capture are required
 *   assets:        no dedicated CDN — assets are SAME-ORIGIN relative paths under
 *                  /assets/{images,css,js}/ with ?v=<hash>; the only cross-origin
 *                  host referenced statically is fonts.googleapis.com (CSS)
 *
 * Carrd emits NO <meta name="generator">, so detectGenerator is intentionally omitted.
 */

const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];

export const carrd: PlatformHandler = {
  name: 'carrd',
  displayName: 'Carrd',
  category: 'builder',
  priority: 85,

  detectByUrl(url: string): boolean {
    return /\.carrd\.co/i.test(url);
  },

  detectByHtml(html: string): boolean {
    return (
      // Hallmark inline runtime IIFE, present on every Carrd site (new and old).
      html.includes("$inner = $('.inner')") ||
      // Free-plan "( Made with Carrd )" badge anchor.
      html.includes('href="https://carrd.co"') ||
      // Carrd's component-class scheme (…-component). Webflow uses w-* prefixes and
      // Wix uses random ids, so this family does not collide with the frozen trio.
      /class="[^"]*\b(?:text|image|container|buttons|icons|divider|links)-component\b/.test(html) ||
      // Current-gen structural nesting: .site-wrapper > .site-main (both required, so
      // neither generic-sounding class triggers detection on its own).
      (html.includes('class="site-wrapper"') && html.includes('class="site-main"'))
    );
  },

  // No third-party analytics/telemetry is injected by default (profile
  // analyticsScripts is empty), and fonts.googleapis.com is a needed asset host,
  // so nothing is blocked during capture.
  stripDomains: [],

  // The badge id sits directly on the <p> (there is no wrapper div and no
  // class="credits"); removing #credits drops the whole "Made with Carrd" line.
  stripSelectors: ['#credits'],

  stripPatterns: [
    // Free-plan badge paragraph: <p id="credits"><a href="https://carrd.co">…</a></p>
    /<p[^>]*id="credits"[^>]*>[\s\S]*?<\/p>/gi,
    // Belt-and-suspenders: the branded badge anchor itself (anchored on the exact
    // "( Made with Carrd )" text so a genuine user link to carrd.co is never removed).
    /<a[^>]*href="https:\/\/carrd\.co"[^>]*>\s*\(\s*Made with Carrd\s*\)\s*<\/a>/gi,
  ],

  // ssr-static: the raw SSR HTML is complete, so no hydration wait is required
  // (profile needsHydrationCheck=false, hydrationTimeoutMs=0). antiBot is Cloudflare
  // but the pages fetched cleanly in research; per the authoring guide we keep a
  // small capture buffer instead of the literal 0 ms.
  hydrationTimeout: 2000,
  needsHydrationCheck: false,

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    // Google Fonts stylesheet — the only cross-origin CDN Carrd references in the
    // raw HTML (a <link> to the @font-face CSS, present only on sites using
    // non-system fonts). The font files load at runtime from fonts.gstatic.com and
    // are not part of the static export.
    if (host.includes('fonts.googleapis.com')) {
      return 'styles';
    }

    // Carrd serves all of its own assets same-origin under /assets/{images,css,js}/
    // with ?v=<hash> cache-busting; the host is the page's *.carrd.co. Pro sites on
    // custom domains fall through to null and are handled by the generic fallback.
    if (host.includes('carrd.co')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (pathname.includes('/assets/images/') || IMG_EXTS.includes(ext)) return 'assets/images';
      if (pathname.includes('/assets/css/') || ext === '.css') return 'styles';
      if (pathname.includes('/assets/js/') || ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/misc';
    }

    return null;
  },
};
