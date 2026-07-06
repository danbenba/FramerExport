import type { PlatformHandler } from '../types.js';

/**
 * Systeme.io — v5 production handler.
 *
 * Verified against RAW HTML of two live pages (risefunnels.systeme.io/izzy/free,
 * freetemplates.systeme.io/landing-page). Both HTTP 200, no anti-bot.
 *
 * Stack: React SSR + react-helmet (`data-react-helmet="true"`) + server-rendered
 * styled-components (`<style data-styled data-styled-version="6.x">`). Content is
 * present in the SSR body (not client-only) → renderStrategy "hybrid" but we do
 * NOT capture the rendered DOM. Hydrates via `window.__PRELOADED_STATE__`.
 *
 * Strongest, byte-for-byte confirmed marker: `<!-- Created with https://systeme.io -->`
 * sits immediately after `<!DOCTYPE html>` on every page (custom CNAME domains too).
 *
 * CDN roles (all cloudfront.net, confirmed):
 *   d3fit27i5nzkqh — JS/CSS webpack bundles (/default/runtime|page|vendors.*.js)
 *   d1yei2z3i6k35z — user-uploaded images / favicons
 *   d2543nuuc0wvdg — system assets (serves /favicon.ico)
 *   d3syewzhvzylbl — self-hosted Google Fonts (/fonts/google-fonts/*.woff2)
 *
 * PlatformHandler signatures (see src/platforms/types.ts):
 *   detectByUrl(url: string): boolean
 *   detectByHtml(html: string): boolean
 *   mapAssetDir(host: string, pathname: string, ext: string): string | null
 */

const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];

export const systemeio: PlatformHandler = {
  name: 'systemeio',
  displayName: 'Systeme.io',
  category: 'landing',
  priority: 80,

  detectByUrl(url: string): boolean {
    return /\.systeme\.io/i.test(url);
  },

  detectByHtml(html: string): boolean {
    // All four markers are systeme.io-account-specific: the byte-for-byte branding
    // comment, the two account-specific CloudFront distribution hosts, and the
    // affiliate badge href. (Deliberately NOT `window.initialI18nStore` /
    // `window.__PRELOADED_STATE__` — those are generic i18next/React-SSR globals
    // emitted by unrelated sites and would produce false positives.)
    return (
      html.includes('<!-- Created with https://systeme.io -->') ||
      html.includes('d3fit27i5nzkqh.cloudfront.net') ||
      html.includes('systeme.io/?sa=') ||
      html.includes('d3syewzhvzylbl.cloudfront.net')
    );
  },

  // First-party click/funnel telemetry — blocked during capture, never downloaded.
  stripDomains: ['log.systeme.io'],

  stripSelectors: ['script[src*="log.systeme.io"]'],

  stripPatterns: [
    // Footer credit/affiliate badge: <a href="https://systeme.io/?sa=<code>" ...>SITE CREDIT</a>.
    // Match on the `systeme.io/?sa=` href affiliate param (visible label is owner-editable).
    /<a[^>]*href="[^"]*systeme\.io\/\?sa=[^"]*"[^>]*>[\s\S]*?<\/a>/g,
    // Branding comment injected right after <!DOCTYPE html>.
    /<!--\s*Created with https:\/\/systeme\.io\s*-->/g,
  ],

  hydrationTimeout: 0,
  needsHydrationCheck: false,

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    // JS/CSS webpack bundles (runtime/page/vendors.*.js under /default/).
    if (host.includes('d3fit27i5nzkqh.cloudfront.net')) {
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      if (ext === '.json') return 'data';
      return 'assets/misc';
    }

    // Self-hosted Google Fonts (/fonts/google-fonts/*.woff2).
    if (host.includes('d3syewzhvzylbl.cloudfront.net')) {
      if (FONT_EXTS.includes(ext) || pathname.includes('/fonts/')) return 'assets/fonts';
      if (ext === '.css') return 'styles';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      return 'assets/misc';
    }

    // User-uploaded images / favicons.
    if (host.includes('d1yei2z3i6k35z.cloudfront.net')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext) || pathname.includes('/images/')) return 'assets/images';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      return 'assets/misc';
    }

    // System assets (serves /favicon.ico and other platform static files).
    if (host.includes('d2543nuuc0wvdg.cloudfront.net')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      return 'assets/misc';
    }

    return null;
  },
};
