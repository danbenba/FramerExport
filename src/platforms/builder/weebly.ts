import type { PlatformHandler } from '../types.js';

/**
 * Weebly — v5 handler.
 *
 * Interface: PlatformHandler (src/platforms/types.ts):
 *   detectByUrl(url: string): boolean
 *   detectByHtml(html: string): boolean
 *   mapAssetDir(host: string, pathname: string, ext: string): string | null
 *
 * Render model: ssr-static — full nav/content/meta is present in the raw HTML;
 * JS only enhances (badge injection, analytics, forms). So we do NOT capture the
 * rendered DOM and do NOT wait for hydration.
 *
 * Detection: default hosting subdomain <name>.weebly.com (URL) plus content
 * signals that persist on custom domains — the ubiquitous `wsite-` class/id
 * prefix, the `window._W` config object, and `Weebly.footer.setupContainer`.
 * The editmysite.com CDN is deliberately NOT used as a detectByHtml marker: it is
 * shared with Square Online, so matching the host would misclassify Square sites
 * as Weebly. We rely only on Weebly-specific `wsite-`/`_W`/`Weebly.footer` markers.
 * No `<meta name="generator">` is emitted (confirmed on both new- and old-template
 * sites), so there is no detectGenerator.
 *
 * Assets: platform CSS/JS/images live on cdn1/cdn2/cdn11.editmysite.com; per-site
 * theme + uploads are served path-relative under /files/ and /uploads/ on the
 * site's own domain (foreign host → null → generic fallback handles them).
 */

const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];

export const weebly: PlatformHandler = {
  name: 'weebly',
  displayName: 'Weebly',
  category: 'builder',
  priority: 82,

  detectByUrl(url: string): boolean {
    return /\.weebly\.com/i.test(url);
  },

  detectByHtml(html: string): boolean {
    // Weebly-specific markers only. `editmysite.com` is intentionally NOT used
    // here — it is the shared Square Online / Weebly asset CDN and would produce
    // false positives on Square sites.
    return (
      html.includes('Weebly.footer.setupContainer') ||
      html.includes('weebly-footer-signup-container-v3') ||
      html.includes('wsite-content') ||
      html.includes('window._W')
    );
  },

  // Third-party telemetry only. NEVER list editmysite.com here — that host serves
  // the platform CSS/JS/images (cdn1/cdn2/cdn11) and blocking it deletes assets.
  // The Weebly _W.Analytics trackers (main.js, stl.js) also live on that CDN, so
  // they are intentionally not blocked (blocking the host would kill assets too).
  stripDomains: ['google-analytics.com'],

  // Footer "Made with Weebly" signup badge: unique container id (empty in SSR
  // HTML, populated client-side) plus the script that injects it.
  stripSelectors: ['#weebly-footer-signup-container-v3', 'script[src*="footerSignup.js"]'],

  // Best-effort removal of the rendered badge anchor should it appear inline.
  stripPatterns: [/<a[^>]*href="[^"]*weebly\.com\/signup[^"]*"[^>]*>[\s\S]*?<\/a>/g],

  hydrationTimeout: 0,
  needsHydrationCheck: false,

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    // Covers cdn1/cdn2/cdn11.editmysite.com and the bare editmysite.com origin.
    if (host.includes('editmysite.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (pathname.includes('/images/') || IMG_EXTS.includes(ext)) return 'assets/images';
      if (pathname.includes('/css/') || ext === '.css') return 'styles';
      if (pathname.includes('/js/') || ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/misc';
    }

    return null;
  },
};
