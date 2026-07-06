import type { PlatformHandler } from '../types.js';

/**
 * Notion — Notion Sites (published <workspace>.notion.site pages).
 *
 * Pure client-side SPA: the raw response is a generic ~17.5KB shell
 * (`<html class="notion-html" data-notion-html="web" data-notion-version="…">`,
 * an empty `<div id="notion-app"></div>`, `window.__notion_boot_data=null`, and
 * repeated `__notion_html_async.push(...)` hydration calls). All real content is
 * rendered into `#notion-app` after hydration, so we MUST capture the rendered
 * DOM. Assets come from AWS-signed S3 URLs that expire ~1h, hence the mandatory
 * download-at-export-time behaviour the pipeline already provides.
 *
 * Interface: see src/platforms/types.ts
 *   detectByUrl(url) / detectByHtml(html) → boolean
 *   mapAssetDir(host, pathname, ext) → folder | null
 */

const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];

export const notion: PlatformHandler = {
  name: 'notion',
  displayName: 'Notion (Notion Sites)',
  category: 'cms',
  priority: 85,

  detectByUrl(url: string): boolean {
    return /\.notion\.site/i.test(url);
  },

  detectByHtml(html: string): boolean {
    // All four are Notion-only, verified verbatim in the raw shell, and do not
    // collide with Framer / Webflow / Wix markers.
    return (
      html.includes('data-notion-html="web"') ||
      html.includes('id="notion-app"') ||
      html.includes('__notion_html_async') ||
      html.includes('window.__notion_boot_data')
    );
  },

  // Notion's own Splunk telemetry collector — blocked during capture. NEVER add
  // the asset hosts (www.notion.so / *.amazonaws.com) here; they serve real files.
  stripDomains: ['http-inputs-notion.splunkcloud.com'],

  // Pre-hydration loading chrome. captureRenderedDom normally replaces these once
  // #notion-app hydrates; stripping them is a defensive no-content cleanup in case
  // hydration is partial.
  stripSelectors: ['#initial-loading-spinner', '#skeleton', '#skeleton-sidebar'],

  stripPatterns: [
    // "Built with Notion" watermark is React-injected post-hydration (ABSENT from
    // raw HTML — selector/href unverified). Best-effort removal from the captured
    // rendered DOM: an <a> pointing at notion.so/notion.com that also carries the
    // badge's signature text. Both conditions keep this from matching real content.
    /<a[^>]*href="[^"]*notion\.(so|com)[^"]*"[^>]*>[\s\S]*?Built with Notion[\s\S]*?<\/a>/gi,
  ],

  hydrationTimeout: 8000,
  needsHydrationCheck: true,
  hydrationSelector: '#notion-app',
  captureRenderedDom: true,

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    // Notion image proxy / app image host — serves optimized/resized images
    // (often extension-less proxy URLs), so default to images.
    if (host.includes('img.notionusercontent.com') || host.includes('app.notion.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (IMG_EXTS.includes(ext) || pathname.includes('/image')) return 'assets/images';
      return 'assets/images';
    }

    // Signed S3 upload stores (user files: images, video, fonts, docs). URLs are
    // AWS-signed and expire ~1h — the pipeline downloads them at export time.
    if (
      host.includes('prod-files-secure.s3.us-west-2.amazonaws.com') ||
      host === 's3.us-west-2.amazonaws.com'
    ) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      return 'assets/misc';
    }

    // Notion app origin — hashed /_assets/*.js bundles, /print.*.css, JSON data
    // (loadPageChunk / recordMap) and fonts served same-origin from www.notion.so.
    if (host.includes('www.notion.so') || host.includes('notion.so')) {
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      if (ext === '.json') return 'data';
      return 'assets/misc';
    }

    return null;
  },
};
