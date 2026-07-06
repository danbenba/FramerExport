import type { PlatformHandler } from '../types.js';

/**
 * Elementor — v5 production handler.
 *
 * Elementor is a WordPress page-builder PLUGIN, not a hosting platform. Sites run
 * on the owner's own domain and serve EVERY Elementor asset same-origin under
 * /wp-content/plugins/elementor(-pro)/ and per-page compiled CSS under
 * /wp-content/uploads/elementor/. There is no front-end asset CDN (cdnDomains: []),
 * so mapAssetDir keys off the canonical WordPress path tree rather than a host.
 * Only Elementor Cloud/Hosting sites sit on a *.elementor.cloud subdomain (which
 * still serves WordPress assets same-origin).
 *
 * Verified live (headless Chrome, raw DOM + asset hosts) against brandonli.com
 * (legacy section/column layout, Elementor 3.31.3) and notarity.com (Flexbox
 * containers, Elementor 3.21.6). Fully server-rendered PHP → renderStrategy
 * "ssr-static": the complete DOM is in the raw HTML, so no hydration wait and no
 * rendered-DOM capture.
 *
 * Detection priority (verified):
 *  1. <meta name="generator" content="Elementor <version>; ..."> — strongest signal,
 *     but NOT reliably the FIRST generator tag (WordPress / Site Kit emit their own,
 *     and the pipeline's readGenerator only reads the first). detectGenerator covers
 *     the case where Elementor's is the first/only generator meta; detectByHtml scans
 *     the whole document for the resilient markers below so optimization-plugin
 *     generator stripping cannot hide the platform.
 *  2. body class elementor-kit-{id} + root div data-elementor-type=... (both survive a
 *     stripped generator).
 *  3. /wp-content/plugins/elementor/ asset path.
 *  4. window.elementorFrontendConfig bootstrap global.
 *
 * Badge/analytics: verified NO "Made with Elementor" badge and NO default analytics
 * on the front end (badgePresent:false, analyticsScripts:[]); googletagmanager /
 * cdn.usefathom.com seen on samples are site-owner additions → all strip lists empty.
 *
 * PlatformHandler signatures (see src/platforms/types.ts):
 *   detectByUrl(url: string): boolean
 *   detectByHtml(html: string): boolean
 *   mapAssetDir(host: string, pathname: string, ext: string): string | null
 */

const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];

export const elementor: PlatformHandler = {
  name: 'elementor',
  displayName: 'Elementor',
  category: 'landing',
  priority: 42,

  // Only Elementor Cloud/Hosting uses a platform subdomain; self-hosted sites live
  // on the owner's own domain and are caught by detectByHtml / detectGenerator.
  detectByUrl(url: string): boolean {
    return /\.elementor\.cloud/i.test(url);
  },

  // OR of four independent, Elementor-specific markers (none match Framer/Webflow/Wix,
  // and #2/#3 survive optimization plugins that strip the generator meta):
  //  - Elementor plugin asset directory
  //  - Elementor "kit" body class
  //  - root wrapper data-attribute
  //  - frontend bootstrap JS global
  detectByHtml(html: string): boolean {
    return (
      html.includes('/wp-content/plugins/elementor/') ||
      html.includes('elementor-kit-') ||
      html.includes('data-elementor-type=') ||
      html.includes('elementorFrontendConfig')
    );
  },

  // Matched against the <meta name="generator"> content only, e.g.
  // "Elementor 3.31.3; features: ...". Anchored so it fires solely on Elementor's own
  // generator string, never on the "WordPress 6.7.5" / "Site Kit by Google" siblings.
  detectGenerator: /^Elementor\s+\d+\.\d+/i,

  // No default third-party telemetry: googletagmanager / cdn.usefathom.com hosts seen
  // on sample sites are site-owner additions, not an Elementor platform default.
  stripDomains: [],

  // No front-end editor chrome or badge element to remove.
  stripSelectors: [],

  // Verified: no "Made with Elementor" badge in the front-end DOM → nothing to strip.
  stripPatterns: [],

  hydrationTimeout: 0,
  needsHydrationCheck: false,

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    // Elementor ships no asset CDN — everything is same-origin on the owner's own
    // (variable) domain, so classify by the canonical WordPress path tree instead of
    // by host. Anything outside /wp-content|/wp-includes is left to the generic fallback.
    if (!pathname.includes('/wp-content/') && !pathname.includes('/wp-includes/')) {
      return null;
    }

    if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
    // Per-page compiled CSS lives at /wp-content/uploads/elementor/css/post-{id}.css and
    // plugin/theme CSS under /wp-content/plugins|themes — test ext before images so the
    // .css files under /uploads/ are not swept into assets/images.
    if (ext === '.css') return 'styles';
    if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
    if (FONT_EXTS.includes(ext)) return 'assets/fonts';
    if (IMG_EXTS.includes(ext)) return 'assets/images';
    if (ext === '.json') return 'data';
    return 'assets/misc';
  },
};
