import type { PlatformHandler } from '../types.js';

/**
 * Instapage — landing-page / funnel builder.
 *
 * Interface: PlatformHandler (see ../types.ts).
 *   detectByUrl(url): boolean
 *   detectByHtml(html): boolean
 *   mapAssetDir(host, pathname, ext): string | null
 *
 * Detection notes (verified across injurylaw.pagedemo.co, solutions.docbyte.com,
 * www.linktek.com):
 *   - Emits NO <meta name="generator"> and NO "Made with Instapage" badge, so
 *     detection relies on URL (default *.pagedemo.co host) plus asset-domain and
 *     inline JS-global fingerprints. Custom-domain sites (CNAME to
 *     secure.pageserve.co) reveal nothing in the URL and are caught by detectByHtml.
 *   - Page runtime bundle is served from c.fastcdn.co as
 *     pageserver.page2.es5.<hash>.bundle.js (verbatim on linktek). Images come from
 *     v.fastcdn.co/u/<accountHash>/..., and beacons hit anthill.instapage.com.
 *   - Inline globals instapageSp / _instapageSnowplow are present in the raw HTML.
 *
 * Render strategy: ssr-static — full content is present in the raw server HTML, so
 * no headless hydration is required (captureRenderedDom intentionally unset).
 */

const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];

export const instapage: PlatformHandler = {
  name: 'instapage',
  displayName: 'Instapage',
  category: 'landing',
  priority: 82,

  detectByUrl(url: string): boolean {
    return /\.(?:pagedemo|pageserve)\.co/i.test(url);
  },

  detectByHtml(html: string): boolean {
    return (
      html.includes('instapageSp') ||
      html.includes('_instapageSnowplow') ||
      html.includes('anthill.instapage.com') ||
      html.includes('pageserver.page2')
    );
  },

  // Telemetry / analytics hosts only — blocked during capture. The fastcdn.co
  // asset CDN is deliberately NOT listed here (those assets are mirrored).
  stripDomains: [
    'anthill.instapage.com',
    'cdn.instapagemetrics.com',
    'heatmap-events-collector.instapage.com',
    'heatmap.services',
  ],

  stripSelectors: [
    'script[src*="instapagemetrics.com"]',
    'script[src*="anthill.instapage.com"]',
    'script[src*="heatmap.services"]',
  ],

  stripPatterns: [
    // Hidden local-storage helper iframe (runtime-injected on live pages; stripped
    // here best-effort in case it appears in the captured markup).
    /<iframe[^>]*d3mwhxgzltpnyp\.cloudfront\.net[^>]*>[\s\S]*?<\/iframe>/g,
  ],

  hydrationTimeout: 0,
  needsHydrationCheck: false,

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    // Covers the fastcdn.co apex plus the v. (images), c. (CSS/JS bundles) and
    // d. (form endpoint) subdomains.
    if (host.includes('fastcdn.co')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext) || pathname.includes('/u/')) return 'assets/images';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.json') return 'data';
      return 'assets/misc';
    }

    // CloudFront distribution serving the local-storage helper.
    if (host.includes('d3mwhxgzltpnyp.cloudfront.net')) {
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (ext === '.css') return 'styles';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/misc';
    }

    return null;
  },
};
