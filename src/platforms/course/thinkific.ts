import type { PlatformHandler } from '../types.js';

/**
 * Thinkific — v5 production handler (course category).
 *
 * Thinkific is a Ruby-on-Rails + Liquid course/membership platform that renders
 * every page server-side (renderStrategy: ssr-static): the raw HTML already
 * contains all course cards, the footer and the copyright, so no rendered-DOM
 * capture is required. Default tenant hosting is {subdomain}.thinkific.com, but
 * many production sites run on custom domains (e.g. courses.winefolly.com) where
 * the URL regex fails and detection MUST fall back to the HTML signatures.
 * Signatures verified against colormatters.thinkific.com (subdomain) and
 * courses.winefolly.com (custom domain).
 *
 * Interface: PlatformHandler (src/platforms/types.ts)
 *   detectByUrl(url: string): boolean
 *   detectByHtml(html: string): boolean
 *   stripDomains / stripSelectors / stripPatterns
 *   mapAssetDir(host: string, pathname: string, ext: string): string | null
 */

const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];

export const thinkific: PlatformHandler = {
  name: 'thinkific',
  displayName: 'Thinkific',
  category: 'course',
  priority: 82,

  detectByUrl(url: string): boolean {
    return /\.thinkific\.com/i.test(url);
  },

  // Four Thinkific-only tells that hold on both subdomain and custom-domain
  // sites. The "Powered by Thinkific" badge is deliberately NOT used here (it is
  // removable on paid plans). None of these strings appear on Framer / Webflow /
  // Wix output.
  detectByHtml(html: string): boolean {
    return (
      html.includes('window.Thinkific') || // inline bootstrap: `window.Thinkific = window.Thinkific || {}`
      html.includes('assets.thinkific.com') || // theme CSS/JS bundle host
      html.includes('cdn.thinkific.com') || // toga-css icon-font host
      html.includes('thnc.current_user-initialized') // custom JS event fired after user bootstrap
    );
  },

  // Telemetry / third-party embed hosts only (profile.analyticsScripts) — NEVER
  // the *.thinkific.com asset CDN. These are matched against the request HOSTNAME
  // only (capture.ts: `host.includes(d)`), so each entry MUST be a bare hostname —
  // a path such as "www.google.com/recaptcha" can never match and would be dead.
  // `fast.wistia.net` = Wistia video player; `www.google.com` = sign-in reCAPTCHA
  // (api.js served from www.google.com/recaptcha; the whole host is safe to block
  // on a static mirror — no legit Thinkific asset is served from it).
  stripDomains: ['fast.wistia.net', 'www.google.com'],

  // The badge is removed via stripPatterns (below), NOT a `.class` stripSelector.
  // The class-based stripper (output.ts) is a non-greedy `…>[\s\S]*?<\/[^>]*>` that
  // stops at the FIRST closing tag, so on the nested badge markup
  // (<div class="footer__white-label"><a><svg><title>…</title>…</svg></a></div>) it
  // would cut at </title>, leaving orphan </svg></a></div> AND deleting the opening
  // <div>/<a> tags that the stripPatterns regexes anchor on (stripSelectors run
  // before stripPatterns). So no stripSelectors are used here.
  stripSelectors: [],

  stripPatterns: [
    // Whole badge wrapper: <div class="footer__white-label"> … </div>
    // (inner anchor + inline SVG titled "Teach online with Thinkific").
    /<div[^>]*class="[^"]*footer__white-label[^"]*"[^>]*>[\s\S]*?<\/div>/g,
    // Belt-and-suspenders: the branded powered-by referral anchor itself.
    /<a[^>]*href="[^"]*thinkific\.com[^"]*utm_medium=powered-by[^"]*"[^>]*>[\s\S]*?<\/a>/g,
  ],

  // ssr-static: the raw SSR HTML is complete, so no hydration wait is needed
  // (profile needsHydrationCheck=false, hydrationTimeoutMs=0). antiBot is
  // Cloudflare (rocket-loader observed) but pages fetched cleanly in research;
  // per the authoring guide we keep a small capture buffer instead of literal 0.
  hydrationTimeout: 2000,
  needsHydrationCheck: false,

  // cdnDomains: assets.thinkific.com, cdn.thinkific.com, cdn-themes.thinkific.com,
  // import.cdn.thinkific.com, files.cdn.thinkific.com (all *.thinkific.com), plus
  // the bare s3.amazonaws.com upload host. Theme bundles/fonts live on the
  // thinkific.com hosts; uploaded media on import.cdn / files.cdn (front S3).
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (host.includes('thinkific.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (pathname.includes('/images/') || IMG_EXTS.includes(ext)) return 'assets/images';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.json') return 'data';
      return 'assets/misc';
    }

    // Bare S3 bucket fronting Thinkific uploads (declared cdnDomain).
    if (host.includes('s3.amazonaws.com')) {
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
