import type { PlatformHandler } from '../types.js';

/**
 * Strikingly — website builder (Airbnb Hypernova SSR + Emotion, React-hydrated).
 *
 * Verified against raw HTML of a real *.mystrikingly.com site:
 *   - Detection: hosting subdomain `*.mystrikingly.com`; no <meta generator>;
 *     `<meta name="strikingly-host-suffix">`, `<meta name="asset-url" content="…strikinglycdn.com">`,
 *     containers `#s-page-client-container` / `#s-content` / `#s-footer-section-container`,
 *     Hypernova markers `data-hypernova-key="SiteBootstrapper"`.
 *   - Assets: five strikinglycdn.com subdomains (static-assets = JS/CSS,
 *     static-fonts-css = fonts, user-images/custom-images/uploads = user media)
 *     plus jQuery from cdnjs.cloudflare.com.
 *   - Badge: "Powered by Strikingly" footer, container class `.show-strikingly-logo`
 *     inside `#s-footer-section-container`; its visible anchor
 *     (href https://www.strikingly.com/?ref=logo&…&utm_campaign=footer_pbs&…)
 *     is hydration-rendered, so we also strip it from the captured rendered DOM.
 *
 * PlatformHandler signature: see ../types.ts.
 */

const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];

export const strikingly: PlatformHandler = {
  name: 'strikingly',
  displayName: 'Strikingly',
  category: 'builder',
  priority: 85,

  detectByUrl(url: string): boolean {
    return /\.mystrikingly\.com/i.test(url);
  },

  detectByHtml(html: string): boolean {
    return (
      html.includes('strikingly-host-suffix') ||
      html.includes('data-hypernova-key="SiteBootstrapper"') ||
      html.includes('id="s-page-client-container"') ||
      html.includes('strikinglycdn.com')
    );
  },

  // Telemetry / error-monitoring only — NEVER the strikinglycdn asset CDN.
  stripDomains: [
    'google-analytics.com',
    'www.google-analytics.com',
    'notify.bugsnag.com',
    'sessions.bugsnag.com',
  ],

  // The "Powered by Strikingly" footer section carries the unique class
  // `.show-strikingly-logo` (inside #s-footer-section-container).
  stripSelectors: ['.show-strikingly-logo'],

  stripPatterns: [
    // Hydration-rendered badge anchor → https://www.strikingly.com/?ref=logo…&utm_campaign=footer_pbs
    /<a[^>]*href="[^"]*strikingly\.com\/\?ref=logo[^"]*"[^>]*>[\s\S]*?<\/a>/gi,
  ],

  // renderStrategy: react-hydration → use the rendered DOM as the HTML source.
  hydrationTimeout: 3000,
  needsHydrationCheck: false,
  hydrationSelector: '#s-page-client-container',
  captureRenderedDom: true,

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    // Strikingly's own CDN — all *.strikinglycdn.com subdomains.
    if (host.includes('strikinglycdn.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';

      // static-fonts-css.strikinglycdn.com → font files + font CSS.
      if (host.includes('static-fonts-css')) {
        if (FONT_EXTS.includes(ext)) return 'assets/fonts';
        if (ext === '.css') return 'styles';
      }

      // static-assets.strikinglycdn.com → JS/CSS bundles (+ occasional assets).
      if (host.includes('static-assets')) {
        if (ext === '.css') return 'styles';
        if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
        if (FONT_EXTS.includes(ext)) return 'assets/fonts';
        if (IMG_EXTS.includes(ext) || pathname.includes('/images/')) return 'assets/images';
        return 'assets/misc';
      }

      // user-images / custom-images / uploads → user-uploaded media.
      if (IMG_EXTS.includes(ext) || pathname.includes('/images/')) return 'assets/images';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      return 'assets/misc';
    }

    // Public CDN Strikingly loads jQuery (and a few libs) from.
    if (host.includes('cdnjs.cloudflare.com')) {
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (ext === '.css') return 'styles';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      return 'assets/misc';
    }

    return null;
  },
};
