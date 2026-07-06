import type { PlatformHandler } from '../types.js';

/**
 * Teachable (course platform, server-rendered Rails app, codename "fedora").
 *
 * Detection keys on the asset CDN `teachablecdn.com` — present in raw HTML on
 * both default `*.teachable.com` subdomains and custom-domain schools (verified
 * on intent.teachable.com and courses.stationx.net). The strongest single tell
 * is `<meta name="asset_host" content="https://fedora.teachablecdn.com">`.
 *
 * Render is `ssr-static`: `.course-block.block.<type>` divs with `id=block-<n>`
 * ship in the initial HTML, so we do NOT capture the rendered DOM.
 *
 * Badge: footer `<a class='powered-by' href='https://teachable.com/...?src=school_footer'>`
 *   with `span.powered-by-text` "Teach Online with" + a branding logomark SVG.
 *   The href varies per school (/teach-online/?src=school_footer vs /?src=school_footer);
 *   the stable anchors are the `powered-by` class and the `teachable.com` href.
 *   Removed via stripPatterns (NOT a `.powered-by` stripSelector): the selector
 *   engine only matches double-quoted class attrs and cuts to the first `</…>`,
 *   which would mangle this single-quoted multi-child anchor. The regexes below
 *   grab the whole `<a>…</a>` for both `'` and `"` quoting.
 *
 * CDN hosts: fedora.teachablecdn.com (page CSS/JS — /assets/*.css sprockets,
 *   /packs/*.js webpacker), assets.teachablecdn.com (fonts/branding),
 *   uploads.teachablecdn.com (user media). All share the `teachablecdn.com` suffix.
 */

const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];

export const teachable: PlatformHandler = {
  name: 'teachable',
  displayName: 'Teachable',
  category: 'course',
  priority: 82,

  detectByUrl(url: string): boolean {
    return /\.teachable\.com/i.test(url);
  },

  detectByHtml(html: string): boolean {
    return (
      html.includes('teachablecdn.com') ||
      html.includes('eventable.internal.teachable.com') ||
      html.includes('Teach Online with') ||
      html.includes('src=school_footer')
    );
  },

  stripDomains: [
    'cdn.heapanalytics.com',
    'bam.nr-data.net',
    'www.recaptcha.net',
    'fast.wistia.com',
  ],

  stripSelectors: [
    // Analytics <script src> tags left in the HTML (hosts also blocked at capture
    // via stripDomains). The powered-by badge is handled by stripPatterns instead
    // — a `.class` selector can't match its single-quoted, multi-child anchor.
    'script[src*="heapanalytics.com"]',
    'script[src*="nr-data.net"]',
  ],

  stripPatterns: [
    // Footer "Teach Online with" badge — anchored on its unique powered-by class.
    /<a[^>]*class=['"][^'"]*powered-by[^'"]*['"][^>]*>[\s\S]*?<\/a>/gi,
    // Fallback: anchored on the teachable.com ?src=school_footer badge href.
    /<a[^>]*href=['"][^'"]*teachable\.com[^'"]*src=school_footer[^'"]*['"][^>]*>[\s\S]*?<\/a>/gi,
  ],

  hydrationTimeout: 0,
  needsHydrationCheck: false,

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    // fedora / assets / uploads .teachablecdn.com all share this suffix.
    if (host.includes('teachablecdn.com')) {
      // Extension-first: Teachable's Rails/sprockets pipeline serves CSS, JS,
      // fonts and images all under /assets/, so a /assets/ path check must never
      // pre-empt the font/js/json classification.
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (ext === '.json') return 'data';
      // Fallback for hashed / extensionless asset URLs.
      if (pathname.includes('/images/')) return 'assets/images';
      if (pathname.includes('/packs/')) return 'scripts/vendor';
      return 'assets/misc';
    }

    return null;
  },
};
