import type { PlatformHandler } from '../types.js';

/**
 * Podia — Ruby-on-Rails + Hotwire (Turbo/Stimulus) storefront whose page
 * sections render as React islands. The raw SSR body contains only empty
 * `<div class="react-page-section" data-react-component="creator_ui/section_adapters/…"
 * data-props="{escaped JSON}">` shells; all copy/colours/links/media hydrate
 * client-side. Therefore we capture the RENDERED DOM.
 *
 * PlatformHandler signature (see ../types.ts):
 *   detectByUrl(url), detectByHtml(html), detectGenerator?, stripDomains,
 *   stripSelectors, stripPatterns, hydrationTimeout, needsHydrationCheck,
 *   hydrationSelector?, scrollStrategy?, captureRenderedDom?,
 *   mapAssetDir(host, pathname, ext) → folder | null.
 *
 * Framework CSS/JS live on cdn.podia.com; user media lives on the SITE'S OWN
 * domain under /content-assets/public/<JWT>. Verified across demo.podia.com,
 * examples.podia.com and the custom domain thecreativebodega.com.
 */

const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];

export const podia: PlatformHandler = {
  name: 'podia',
  displayName: 'Podia',
  category: 'course',
  priority: 80,

  detectByUrl(url: string): boolean {
    // Coarse hint: also matches app/cdn/www.podia.com, so detectByHtml must corroborate.
    return /\.podia\.com/i.test(url);
  },

  detectByHtml(html: string): boolean {
    return (
      // Constant Turnstile site-key present on every Podia storefront (incl. custom domains).
      html.includes('0x4AAAAAAAJ5kwYW6AH1ybLx') ||
      // Shared framework asset host (storefront-<hash>.css/.js, user-site-<hash>.js).
      html.includes('cdn.podia.com') ||
      // React section-adapter islands unique to Podia's creator UI.
      html.includes('data-react-component="creator_ui/section_adapters/') ||
      // Stimulus controller wiring the editable page sections.
      html.includes('data-controller="editor--page-section"')
    );
  },

  // Telemetry only — NEVER the asset CDN. Podia's default analytics is Google Tag Manager.
  stripDomains: ['www.googletagmanager.com'],

  stripSelectors: ['script[src*="googletagmanager.com"]'],

  stripPatterns: [
    // "Powered by Podia" footer badge — React-rendered anchor in the captured DOM.
    // Its href is https://www.podia.com?utm_medium=poweredby&utm_source=footer
    // (the "&" may serialize as "&amp;"). Anchor on the stable brand host + the
    // badge-unique utm_medium=poweredby token; tolerate single/double quotes and any
    // chars between host and token (e.g. a "/" before the query string).
    /<a[^>]*href=['"][^'"]*podia\.com[^'"]*utm_medium=poweredby[^'"]*['"][^>]*>[\s\S]*?<\/a>/gi,
  ],

  hydrationTimeout: 4000,
  needsHydrationCheck: true,
  // Content lives in these React islands rather than a #main root.
  hydrationSelector: '.react-page-section',
  captureRenderedDom: true,

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    // Shared framework assets: storefront-<hash>.css/.js, user-site-<hash>.js, fonts, images.
    if (host.includes('cdn.podia.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (IMG_EXTS.includes(ext) || pathname.includes('/images/')) return 'assets/images';
      return 'assets/misc';
    }

    // User-uploaded media on Podia-hosted subdomains: /content-assets/public/<JWT>.
    // Custom domains fall through to null so the generic fallback handles them.
    if (host.includes('.podia.com') && pathname.includes('/content-assets/')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/misc';
    }

    return null;
  },
};
