import type { PlatformHandler } from '../types.js';

/**
 * Squarespace — v5 handler (7.1, verified).
 *
 * PlatformHandler: name/displayName/category/priority + detectByUrl(url:string),
 * detectByHtml(html:string), mapAssetDir(host,pathname,ext) → folder|null.
 *
 * Verified against 3 live 7.1 sites (nerine-floral.squarespace.com plus two
 * CUSTOM domains: samfresquez.com, notcrispyenough.com) via raw curl. Content is
 * fully server-rendered (ssr-static), so we mirror the raw HTML — no rendered-DOM
 * capture needed. detectUrlRegex `\.squarespace\.com` only matches the default
 * subdomain, so detection leans primarily on the raw-HTML markers below, which
 * survive custom-domain hosting.
 *
 * No `detectGenerator`: 7.1 sites emit NO `<meta name="generator">` (confirmed
 * absent on all three). No badge: paid/template sites carry no "Made with
 * Squarespace" badge in the DOM (badgePresent=false). Analytics are first-party
 * only (no default third-party telemetry host), so stripDomains stays empty.
 */

const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];

/** Numbered static edges (static1..staticN.squarespace.com) are interchangeable. */
const STATIC_EDGE_RE = /^static\d+\.squarespace\.com$/i;

export const squarespace: PlatformHandler = {
  name: 'squarespace',
  displayName: 'Squarespace',
  category: 'builder',
  priority: 82,

  detectByUrl(url: string): boolean {
    return /\.squarespace\.com/i.test(url);
  },

  detectByHtml(html: string): boolean {
    return (
      html.includes('<!-- This is Squarespace. -->') ||
      html.includes('Static.SQUARESPACE_CONTEXT') ||
      html.includes('<!-- End of Squarespace Headers -->') ||
      html.includes('images.squarespace-cdn.com')
    );
  },

  // First-party analytics only; no default third-party telemetry host to block.
  stripDomains: [],

  // No editor chrome / badge in public SSR HTML on paid or template sites.
  stripSelectors: [],
  stripPatterns: [],

  hydrationTimeout: 3000,
  needsHydrationCheck: false,

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    // Uploaded imagery. Image URLs are frequently extensionless (resized via
    // ?format=), so default this host to images.
    if (host.includes('images.squarespace-cdn.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.json') return 'data';
      return 'assets/images';
    }

    // File downloads (PDFs, docs, zips, image originals). Classify by extension
    // and default UNKNOWN/extensionless downloads to misc — NOT images.
    if (host.includes('file.squarespace-cdn.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.json') return 'data';
      return 'assets/misc';
    }

    // Shared framework bundles (assets.squarespace.com/universal/...) and the
    // versioned per-site static edges (static1..N.squarespace.com): CSS/JS/fonts.
    if (host.includes('assets.squarespace.com') || STATIC_EDGE_RE.test(host)) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.json') return 'data';
      if (IMG_EXTS.includes(ext) || pathname.includes('/images/')) return 'assets/images';
      return 'assets/misc';
    }

    // Config / definition payloads.
    if (host.includes('definitions.sqspcdn.com')) {
      if (ext === '.json') return 'data';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      return 'assets/misc';
    }

    return null;
  },
};
