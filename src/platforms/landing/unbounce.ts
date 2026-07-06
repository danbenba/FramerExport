import type { PlatformHandler } from '../types.js';

/**
 * Unbounce — v5 production handler (category: landing, id: "unbounce").
 *
 * Detection (verified across 3 real Classic-Builder pages, a urlscan.io capture
 * and Unbounce's own community docs):
 *   • URL      → default-hosted pages live at *.unbouncepages.com / *.ubpages.com
 *                (custom CNAME'd domains are caught by the HTML signals below).
 *   • HTML     → root container id="lp-pom-root", inline `window.ub.page` global,
 *                and assets served from builder-assets.unbounce.com / *.ubembed.com.
 *   • Generator→ none (the <meta name="generator" content="Unbounce"> tag is NOT
 *                emitted on real pages — do not rely on it).
 *
 * Render: ssr-static — the fully positioned lp-pom-* markup is present in the raw
 * server HTML, so no hydration wait and no rendered-DOM capture are required.
 *
 * Badge: free/trial pages carry an Unbounce-branded footer that links to
 * unbounce.com. The exact markup is UNVERIFIED, and its selector
 * (`#lp-pom-root a[href*="unbounce.com"]`) uses a descendant combinator that the
 * post-processor does not support, so it is removed via a best-effort
 * `stripPatterns` regex anchored on the brand href instead.
 *
 * Assets: images/CSS/JS come from builder-assets.unbounce.com, assets.unbounce.com
 * and Amazon CloudFront (the cloudfront subdomain ROTATES per account/deploy, so
 * we match the shared cloudfront.net host). Popups/sticky-bars/convertables load
 * from *.ubembed.com.
 */

const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];

export const unbounce: PlatformHandler = {
  name: 'unbounce',
  displayName: 'Unbounce',
  category: 'landing',
  priority: 82,

  detectByUrl(url: string): boolean {
    return /\.(?:unbouncepages|ubpages)\.com/i.test(url);
  },

  detectByHtml(html: string): boolean {
    return (
      html.includes('lp-pom-root') ||
      html.includes('window.ub.page') ||
      html.includes('builder-assets.unbounce.com') ||
      html.includes('ubembed.com')
    );
  },

  // No first-party telemetry/analytics hosts to block (profile analyticsScripts: []).
  // The asset CDNs (builder-assets / cloudfront / ubembed) must NOT be listed here.
  stripDomains: [],

  // The badge selector (#lp-pom-root a[href*="unbounce.com"]) is a descendant
  // combinator, unsupported by stripSelectors — handled via stripPatterns below.
  stripSelectors: [],

  stripPatterns: [
    // Best-effort removal of the "Made with Unbounce" branded footer link.
    // Anchored on the exact brand host so it never matches *.unbouncepages.com /
    // *.ubpages.com hosting links. Markup is approximate (badge markup UNVERIFIED).
    /<a[^>]*href="https?:\/\/(?:www\.)?unbounce\.com[^"]*"[^>]*>[\s\S]*?<\/a>/gi,
  ],

  hydrationTimeout: 0,
  needsHydrationCheck: false,

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    // First-party Unbounce asset hosts (Classic-Builder blocks, images, CSS, JS).
    if (host.includes('builder-assets.unbounce.com') || host.includes('assets.unbounce.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext) || pathname.includes('/lp-image')) return 'assets/images';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.json') return 'data';
      return 'assets/misc';
    }

    // Popups / sticky-bars / convertables embed CDN (assets.ubembed.com,
    // <hash>.js.ubembed.com, ubembed.com).
    if (host.includes('ubembed.com')) {
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/misc';
    }

    // Amazon CloudFront — Unbounce image/asset delivery. The subdomain rotates
    // per account/deploy (d9hhrg4mnvzow, d2xxq4ijfwetlm, doug1izaerwt3, ...), so
    // match the shared cloudfront.net host rather than a fixed subdomain.
    if (host.includes('cloudfront.net')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext) || pathname.includes('/images/')) return 'assets/images';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/misc';
    }

    return null;
  },
};
