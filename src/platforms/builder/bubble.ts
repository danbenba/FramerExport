import type { PlatformHandler } from '../types.js';

/**
 * Bubble — v5 production handler.
 *
 * Interface: PlatformHandler (src/platforms/types.ts).
 *   detectByUrl(url: string): boolean
 *   detectByHtml(html: string): boolean
 *   mapAssetDir(host: string, pathname: string, ext: string): string | null
 *
 * Bubble apps are client-rendered SPAs: the raw SSR <body> is essentially empty
 * (JS error-fallback overlays only), so captureRenderedDom is required and the
 * exporter must run a headless browser (needsHydrationCheck=true). The rendered
 * app roots at #main-page and content nodes carry class "bubble-element" — both
 * runtime-only, absent from static HTML.
 *
 * Detection: the default hosting subdomain *.bubbleapps.io is the primary URL
 * tell (priority 85). Custom-domain Bubble apps are caught by HTML/JS markers:
 * window.appquery = make_proxy(...), the window.bubble_* / _bubble_page_load_data
 * globals, and the /package/{early_js,run_js,dynamic_js,static_js,run_css,
 * pre_run_jquery_js}/<hash>/ bundle paths. No <meta name="generator"> is emitted.
 *
 * Verified July 2026 against raw HTML of bubble.io and demo-app-72f8k.bubbleapps.io.
 */

const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];

export const bubble: PlatformHandler = {
  name: 'bubble',
  displayName: 'Bubble',
  category: 'builder',
  priority: 85,

  detectByUrl(url: string): boolean {
    return /\.bubbleapps\.io/i.test(url);
  },

  detectByHtml(html: string): boolean {
    // Distinctive, stable inline markers found verbatim in every Bubble <head>.
    // None collide with Framer / Webflow / Wix.
    return (
      html.includes('window.appquery = make_proxy(') ||
      html.includes('window._bubble_page_load_data') ||
      html.includes('window.bubble_session_uid') ||
      html.includes('/package/pre_run_jquery_js/')
    );
  },

  // Telemetry only (Plausible-based, on standard-plan apps). NEVER the asset CDN.
  stripDomains: ['pluginpul.se'],

  // Post-process removal of any telemetry <script> that survived into the DOM.
  stripSelectors: ['script[src*="pluginpul.se"]'],

  stripPatterns: [
    // "Made with Bubble" badge — injected at runtime by run.js and gated by
    // window._p.no_branding, so it never appears in the raw SSR HTML (only in
    // the captured rendered DOM). Best-effort strip anchored on its bubble.io
    // target: matches an <a> pointing at the bubble.io ROOT (optionally with a
    // tracking query), which is tight enough to spare normal deep-links to
    // bubble.io content pages.
    /<a\b[^>]*href="https?:\/\/(?:www\.)?bubble\.io\/?(?:\?[^"]*)?"[^>]*>[\s\S]*?<\/a>/gi,
  ],

  needsHydrationCheck: true,
  hydrationTimeout: 8000,
  hydrationSelector: '#main-page',
  captureRenderedDom: true,

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    // Platform font bucket (also fed by the Google WebFont loader).
    if (host.includes('meta-fonts.cdn.bubble.io')) {
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.css') return 'styles';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      return 'assets/misc';
    }

    // Per-app uploads (<32-hex>.cdn.bubble.io) plus the platform buckets
    // meta.cdn.bubble.io / meta-q.cdn.bubble.io / base cdn.bubble.io. The
    // substring match catches all *.cdn.bubble.io subdomains.
    if (host.includes('cdn.bubble.io')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (pathname.includes('/images/') || IMG_EXTS.includes(ext)) return 'assets/images';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.json') return 'data';
      return 'assets/misc';
    }

    // Bubble's CloudFront distributions serve the /package JS + CSS bundles.
    if (
      host.includes('d3dqmih97rcqmh.cloudfront.net') ||
      host.includes('d1muf25xaso8hp.cloudfront.net')
    ) {
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (ext === '.css') return 'styles';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      if (ext === '.json') return 'data';
      return 'assets/misc';
    }

    return null;
  },
};
