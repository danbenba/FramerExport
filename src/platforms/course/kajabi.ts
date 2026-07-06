import type { PlatformHandler } from '../types.js';

/**
 * Kajabi — v5 production handler (course category).
 *
 * Kajabi is a Ruby-on-Rails, fully server-rendered course / membership platform
 * (renderStrategy: ssr-static), so the raw SSR HTML is the source of truth — no
 * rendered-DOM capture is required. Signatures re-verified live (2026-07-06)
 * against glendz.mykajabi.com and idolcourses.mykajabi.com.
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

export const kajabi: PlatformHandler = {
  name: 'kajabi',
  displayName: 'Kajabi',
  category: 'course',
  priority: 85,

  detectByUrl(url: string): boolean {
    return /\.mykajabi\.com/i.test(url);
  },

  // Four Kajabi-only, tier-independent tells. Badge markers are deliberately NOT
  // used here (the "Powered by Kajabi" badge is absent on paid plans). None of
  // these strings appear on Framer / Webflow / Wix output.
  detectByHtml(html: string): boolean {
    return (
      html.includes('var Kajabi = Kajabi') || // inline bootstrap: `var Kajabi = Kajabi || {};`
      html.includes('Kajabi.currentSiteUser') || // inline theme bootstrap global
      html.includes('kjb-settings-id=') || // Kajabi theme-editor data attribute
      html.includes('kajabi-cdn.com') // storefront/app asset CDN host
    );
  },

  // Telemetry / analytics hosts only — NEVER the kajabi-cdn.com asset hosts.
  stripDomains: ['rs-dp.kajabi.com', 'cdn.rudderlabs.com'],

  // The "Powered by Kajabi" badge wrapper carries a unique class — remove it via
  // selector (first-match). stripPatterns below covers repeats / rendered markup.
  stripSelectors: ['.footer__powered-by'],

  stripPatterns: [
    // Whole badge wrapper: <div class="footer__powered-by"> … </div>
    // (real markup has indentation/newlines between the div and the anchor).
    /<div[^>]*class="[^"]*footer__powered-by[^"]*"[^>]*>[\s\S]*?<\/div>/g,
    // Belt-and-suspenders: the branded referral anchor itself.
    /<a[^>]*href="[^"]*app\.kajabi\.com\/r\/[^"]*powered_by=true[^"]*"[^>]*>[\s\S]*?<\/a>/g,
  ],

  // ssr-static: the raw SSR HTML is complete, so no hydration wait is needed
  // (profile needsHydrationCheck=false, hydrationTimeoutMs=0). antiBot is
  // Cloudflare but the pages fetched cleanly in research; per the authoring
  // guide we keep a small capture buffer instead of the literal 0 ms.
  hydrationTimeout: 2000,
  needsHydrationCheck: false,

  // Both cdnDomains live under *.kajabi-cdn.com
  //   - kajabi-storefronts-production.kajabi-cdn.com
  //   - kajabi-app-assets.kajabi-cdn.com
  // so a single host match covers every declared CDN host; classify by ext/path.
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (host.includes('kajabi-cdn.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (pathname.includes('/images/') || IMG_EXTS.includes(ext)) return 'assets/images';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.json') return 'data';
      return 'assets/misc';
    }

    return null;
  },
};
