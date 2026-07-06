import type { PlatformHandler } from '../types.js';

/**
 * Shopify — SSR-static Liquid storefronts (category: ecommerce).
 *
 * Signatures (verified live Jul 2026 on allbirds / deathwishcoffee / gymshark):
 *  - Inline bootstrap `var Shopify = Shopify || {}` then `Shopify.shop = "<store>.myshopify.com"`.
 *  - First-party `ShopifyAnalytics` + `trekkie` objects beaconing to monorail-edge.shopifysvc.com.
 *  - Assets on `cdn.shopify.com/s/files/...` (legacy/headless) or same-origin `/cdn/shop/files|t/...`
 *    (modern themes, served from the store's own custom domain).
 *  - `.myshopify.com` is the canonical dedicated backend subdomain (revealed even on custom domains).
 *  - No `<meta name="generator">` on modern themes — do NOT rely on it.
 *
 * PlatformHandler contract: detectByUrl(url)/detectByHtml(html)/mapAssetDir(host, pathname, ext).
 */

const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];

export const shopify: PlatformHandler = {
  name: 'shopify',
  displayName: 'Shopify',
  category: 'ecommerce',
  priority: 80,

  detectByUrl(url: string): boolean {
    return /\.myshopify\.com/i.test(url);
  },

  detectByHtml(html: string): boolean {
    // OR of Shopify-only markers. `cdn.shopify.com` catches headless/Hydrogen stores
    // (gymshark) that ship no inline window.Shopify; the others catch standard themes.
    return (
      html.includes('cdn.shopify.com') ||
      html.includes('/cdn/shop/') ||
      html.includes('Shopify.shop') ||
      html.includes('ShopifyAnalytics')
    );
  },

  // Telemetry only — never the asset CDN.
  stripDomains: ['monorail-edge.shopifysvc.com'],

  // The "Powered by Shopify" badge is a NESTED <span class="shopify-powered-by">
  // <a …>…</a></span>. The post-processor's `.class` strip only deletes up to the
  // FIRST closing tag (the inner </a>), which would leave an orphan </span>; worse,
  // stripSelectors run BEFORE stripPatterns, so it would consume the opening <span>
  // and stop the clean span regex below from matching. So the badge is removed
  // purely via stripPatterns — no `.class` selector.
  stripSelectors: [],

  stripPatterns: [
    // Whole badge container: <span class="shopify-powered-by" data-shopify="powered-by"><a href="…shopify.com?utm_campaign=poweredby…">Powered by Shopify</a></span>
    /<span[^>]*class="[^"]*shopify-powered-by[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
    // Fallback: the brand anchor itself (href carries ?utm_campaign=poweredby), in case the <span> wrapper is absent or customised.
    /<a[^>]*href="[^"]*shopify\.com\?utm_campaign=poweredby[^"]*"[^>]*>[\s\S]*?<\/a>/gi,
  ],

  hydrationTimeout: 3500,
  needsHydrationCheck: true,

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    // Modern themes serve /cdn/shop/files/ and /cdn/shop/t/ from the store's OWN
    // (custom) domain, so the host is unknown — classify these by path + ext.
    const isShopifyAssetPath: boolean = pathname.includes('/cdn/shop/');

    if (host.includes('cdn.shopify.com') || isShopifyAssetPath) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.json') return 'data';
      return 'assets/misc';
    }

    if (host.includes('fonts.shopifycdn.com')) {
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/misc';
    }

    if (host.includes('extensions.shopifycdn.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/misc';
    }

    return null;
  },
};
