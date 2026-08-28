import type { PlatformHandler } from '../types.js';
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
    return (
      html.includes('data-notion-html="web"') ||
      html.includes('id="notion-app"') ||
      html.includes('__notion_html_async') ||
      html.includes('window.__notion_boot_data')
    );
  },
  stripDomains: ['http-inputs-notion.splunkcloud.com'],
  stripSelectors: ['#initial-loading-spinner', '#skeleton', '#skeleton-sidebar'],
  stripPatterns: [
    /<a[^>]*href="[^"]*notion\.(so|com)[^"]*"[^>]*>[\s\S]*?Built with Notion[\s\S]*?<\/a>/gi,
  ],
  hydrationTimeout: 8000,
  needsHydrationCheck: true,
  hydrationSelector: '#notion-app',
  captureRenderedDom: true,
  postCapture(html: string): string {
    return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (tag: string) => {
      const openTag: string = tag.slice(0, tag.indexOf('>') + 1);
      return /type=["']application\/(?:ld\+)?json["']/i.test(openTag) ? tag : '';
    });
  },
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (host.includes('img.notionusercontent.com') || host.includes('app.notion.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (IMG_EXTS.includes(ext) || pathname.includes('/image')) return 'assets/images';
      return 'assets/images';
    }
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
