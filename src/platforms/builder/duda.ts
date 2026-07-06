import type { PlatformHandler } from '../types.js';

/**
 * Duda — v5 production handler (category: builder).
 *
 * Detection (verified verbatim on two live Duda sites):
 *   - Strongest, custom-domain-proof signal: the inline
 *     `window.Parameters` config carrying `SiteType: atob('RFVEQU9ORQ==')`
 *     (base64 → 'DUDAONE'), `productId: 'DM_DIRECT'`.
 *   - DOM tell: `<body id="dmRoot" ...>` wrapper.
 *   - First-party tracking script `id="d_track_campaign"`.
 * These do not collide with Framer / Webflow / Wix markup.
 *
 * Render: ssr-static — the full ~200KB page ships in the raw HTML, so no
 * hydration wait and no rendered-DOM capture is required.
 *
 * Badge: "Made with Duda" → https://www.duda.co/inspiration (free/reseller
 * tier only). Removed via a stripPatterns regex anchored on that href, since
 * the anchor carries no stable id/class (its font-size-* classes are per-site).
 *
 * Interface: mapAssetDir(host: string, pathname: string, ext: string) => string | null
 */

const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];

export const duda: PlatformHandler = {
  name: 'duda',
  displayName: 'Duda',
  category: 'builder',
  priority: 82,

  detectByUrl(url: string): boolean {
    return /\.(?:multiscreensite|dudaone)\.com/i.test(url);
  },

  detectByHtml(html: string): boolean {
    return (
      html.includes("atob('RFVEQU9ORQ==')") || // window.Parameters SiteType → 'DUDAONE'
      html.includes('id="dmRoot"') ||
      html.includes('DM_DIRECT') || // window.Parameters productId
      html.includes('d_track_campaign') // first-party tracking script id
    );
  },

  // No external telemetry/analytics hosts on Duda (tracking is inline, first-party).
  stripDomains: [],

  // Inline first-party tracking <script id="..."> elements (removed by id).
  stripSelectors: ['#d_track_campaign', '#d_track_personalization', '#d_track_sp'],

  stripPatterns: [
    // "Made with Duda" badge → https://www.duda.co/inspiration
    /<a[^>]*href="[^"]*duda\.co\/inspiration[^"]*"[^>]*>[\s\S]*?<\/a>/g,
  ],

  hydrationTimeout: 0,
  needsHydrationCheck: false,

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    // Only Duda's own CDN hosts are owned here. This tightly covers all five
    // profile.cdnDomains and nothing else:
    //   irp.cdn-website.com, lirp.cdn-website.com, static.cdn-website.com  → *.cdn-website.com
    //   ms-cdn.multiscreensite.com, irp-cdn.multiscreensite.com           → explicit
    // The bare page host (<site>.multiscreensite.com) and any foreign host
    // (e.g. irp.foreign.com, mycdn-website.com) fall through to null so the
    // generic pipeline handles them.
    const isCdnWebsite = host.endsWith('.cdn-website.com');
    const isMsCdn =
      host === 'ms-cdn.multiscreensite.com' || host === 'irp-cdn.multiscreensite.com';
    if (!isCdnWebsite && !isMsCdn) return null;

    if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
    if (IMG_EXTS.includes(ext) || pathname.includes('/images/')) return 'assets/images';
    if (ext === '.css') return 'styles';
    if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
    if (FONT_EXTS.includes(ext)) return 'assets/fonts';

    // Image-resize proxies (irp.* / lirp.* / irp-cdn.*) serve images and are
    // frequently extensionless (resize params live in the path); the static
    // hosts default their unknown/extensionless assets to misc.
    const isResizeProxy = host.startsWith('irp') || host.startsWith('lirp');
    return isResizeProxy ? 'assets/images' : 'assets/misc';
  },
};
