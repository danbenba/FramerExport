import type { PlatformHandler } from '../types.js';

/**
 * WordPress — v5 production handler.
 *
 * Server-rendered PHP: the full page (nav, articles, footer) is present in the
 * first-byte HTML, so no JS hydration is required (renderStrategy: ssr-static →
 * captureRenderedDom is intentionally NOT set).
 *
 * Detection is generator/path based rather than a single hosting domain, hence
 * the mid-range priority (40). Two deployment shapes are covered:
 *   1. Self-hosted (custom domain, WordPress VIP): generator "WordPress <version>",
 *      same-origin assets under /wp-content/ + /wp-includes/, REST link rel=api.w.org.
 *   2. WordPress.com hosted: generator exactly "WordPress.com", static assets on
 *      s0/s1/s2.wp.com + c0.wp.com, fonts on fonts.wp.com, images via Jetpack Photon
 *      (i0/i1/i2.wp.com), core shared assets on s.w.org, avatars on gravatar.com.
 *
 * Key interface signatures (src/platforms/types.ts):
 *   detectByUrl(url): boolean · detectByHtml(html): boolean · detectGenerator: RegExp
 *   mapAssetDir(host, pathname, ext): string | null
 *
 * No "Made with WordPress" core badge exists (badgePresent=false); only some free
 * WordPress.com themes append a footer credit, which is theme content and left intact.
 */

const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];

export const wordpress: PlatformHandler = {
  name: 'wordpress',
  displayName: 'WordPress',
  category: 'cms',
  priority: 40,

  detectByUrl(url: string): boolean {
    return /\.wordpress\.com|\/wp-(content|includes|json)\//i.test(url);
  },

  detectByHtml(html: string): boolean {
    return (
      html.includes('/wp-includes/') ||
      html.includes('/wp-content/') ||
      html.includes('api.w.org') ||
      html.includes('_wpemojiSettings')
    );
  },

  // Matched against the <meta name="generator"> content only. Covers both
  // "WordPress <version>" (self-hosted) and exact "WordPress.com" (hosted).
  detectGenerator: /WordPress/i,

  // Jetpack / WP.com Stats trackers only — never the asset CDN.
  stripDomains: ['stats.wp.com', 'pixel.wp.com'],

  // Remove the leftover tracker <script> tags after their requests are blocked.
  stripSelectors: ['script[src*="stats.wp.com"]', 'script[src*="pixel.wp.com"]'],

  // No badge to strip; drop the generator meta as an attribution cleanup
  // (shape mirrors webflow.ts). Matches "WordPress 6.9.4" and "WordPress.com".
  stripPatterns: [
    /<meta[^>]*name=["']generator["'][^>]*content=["'][^"']*WordPress[^"']*["'][^>]*>/gi,
  ],

  hydrationTimeout: 0,
  needsHydrationCheck: false,

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    // Jetpack Photon image proxy — always images (rewrites <origin>/<path>?fit=..&ssl=1).
    if (host.includes('i0.wp.com') || host.includes('i1.wp.com') || host.includes('i2.wp.com')) {
      return 'assets/images';
    }

    // Gravatar avatars.
    if (host.includes('gravatar.com')) {
      return 'assets/images';
    }

    // Dedicated WP.com font host.
    if (host.includes('fonts.wp.com')) {
      if (ext === '.css') return 'styles';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      return 'assets/fonts';
    }

    // WP.com concatenated/static CDNs (s0/s1/s2/c0.wp.com) and WordPress.org
    // core shared assets (s.w.org: emoji sprites, images, scripts).
    if (
      host.includes('s0.wp.com') ||
      host.includes('s1.wp.com') ||
      host.includes('s2.wp.com') ||
      host.includes('c0.wp.com') ||
      host.includes('s.w.org')
    ) {
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
