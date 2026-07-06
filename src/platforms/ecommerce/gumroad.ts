import type { PlatformHandler } from '../types.js';

/**
 * Gumroad — Ruby on Rails + Inertia.js + Vite + React, fronted by Cloudflare.
 *
 * Detection anchors (all verified verbatim in raw HTML, 2026-07-06):
 *   - <meta name="action-cable-url" content="wss://cable.gumroad.com/cable" />
 *   - <head prefix="… gumroad: http://ogp.me/ns/fb/gumroad#">
 *   - Vite bundles / fonts / favicon under https://assets.gumroad.com/…
 *   - <meta property="og:type" content="gumroad:product"> (product pages)
 *
 * Render: <div id="app" data-page="…"> is an Inertia root whose SSR DOM is empty;
 * the real content is HTML-entity-encoded JSON in data-page, populated by React on
 * the client. => react-hydration, captureRenderedDom = true, hydrationSelector = #app.
 *
 * Badge: none server-rendered ("Powered by Gumroad" grep returns nothing); any footer
 * attribution is client-side React, so there is nothing to strip statically.
 *
 * CDN hosts (from profile.cdnDomains):
 *   - assets.gumroad.com       (Vite JS/CSS entrypoints, /fonts/*.woff2, /images/*) — active
 *   - public-files.gumroad.com (og/twitter images, favicon, user uploads)          — active
 *   - static-2.gumroad.com     (dns-prefetch only; weak/secondary hint)            — real host
 */

const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];

export const gumroad: PlatformHandler = {
  name: 'gumroad',
  displayName: 'Gumroad',
  category: 'ecommerce',
  priority: 80,

  detectByUrl(url: string): boolean {
    return /\.gumroad\.com|\bgum\.co\b/i.test(url);
  },

  detectByHtml(html: string): boolean {
    // Custom domains defeat the URL regex; these HTML markers are the reliable tell.
    return (
      html.includes('cable.gumroad.com') ||
      html.includes('assets.gumroad.com') ||
      html.includes('ns/fb/gumroad#') ||
      html.includes('gumroad:product')
    );
  },

  // Telemetry / analytics hosts only — never the asset CDN.
  // gumroad-analytics.com is Gumroad's first-party analytics proxy
  // (domain_settings.third_party_analytics_domain); GA / FB Pixel / TikTok Pixel
  // are injected client-side only when the creator enables them.
  stripDomains: [
    'gumroad-analytics.com',
    'www.googletagmanager.com',
    'connect.facebook.net',
    'analytics.tiktok.com',
  ],

  // Defensively drop any surviving analytics <script> tags from the rendered DOM
  // (stripDomains already blocks them at the network layer during capture).
  stripSelectors: [
    'script[src*="gumroad-analytics.com"]',
    'script[src*="googletagmanager.com"]',
    'script[src*="connect.facebook.net"]',
    'script[src*="analytics.tiktok.com"]',
  ],

  // No server-rendered badge to remove (badgePresent = false, confirmed).
  stripPatterns: [],

  hydrationTimeout: 8000,
  needsHydrationCheck: true,
  hydrationSelector: '#app',
  captureRenderedDom: true,

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (
      host.includes('assets.gumroad.com') ||
      host.includes('public-files.gumroad.com') ||
      host.includes('static-2.gumroad.com')
    ) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (pathname.includes('/fonts/') || FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (pathname.includes('/stylesheets/') || ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (pathname.includes('/images/') || IMG_EXTS.includes(ext)) return 'assets/images';
      if (ext === '.json') return 'data';
      return 'assets/misc';
    }

    // cable.gumroad.com (wss), api.gumroad.com and gumroad-analytics.com are not
    // asset CDNs — let the generic fallback handle any foreign host.
    return null;
  },
};
