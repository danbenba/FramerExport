import type { PlatformHandler } from '../types.js';
const IMG_EXTS: string[] = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'];
const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf', '.eot'];
const VIDEO_EXTS: string[] = ['.mp4', '.webm', '.ogg'];
export const shopify: PlatformHandler = {
  name: 'shopify',
  displayName: 'Shopify',
  category: 'ecommerce',
  priority: 80,
  detectByUrl(url: string): boolean {
    return /\.myshopify\.com/i.test(url);
  },
  detectByHtml(html: string): boolean {
    return (
      html.includes('cdn.shopify.com') ||
      html.includes('/cdn/shop/') ||
      html.includes('Shopify.shop') ||
      html.includes('ShopifyAnalytics')
    );
  },
  stripDomains: ['monorail-edge.shopifysvc.com'],
  stripSelectors: [],
  stripPatterns: [
    /<span[^>]*class="[^"]*shopify-powered-by[^"]*"[^>]*>[\s\S]*?<\/span>/gi,
    /<a[^>]*href="[^"]*shopify\.com\?utm_campaign=poweredby[^"]*"[^>]*>[\s\S]*?<\/a>/gi,
  ],
  hydrationTimeout: 3500,
  needsHydrationCheck: true,
  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    const isShopifyAssetPath: boolean = pathname.includes('/cdn/shop/');
    if (host.includes('cdn.shopify.com') || isShopifyAssetPath) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      if (ext === '.json') return 'data';
      return 'assets/misc';
    }
    if (host.includes('fonts.shopifycdn.com')) {
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/misc';
    }
    if (host.includes('extensions.shopifycdn.com')) {
      if (VIDEO_EXTS.includes(ext)) return 'assets/videos';
      if (IMG_EXTS.includes(ext)) return 'assets/images';
      if (ext === '.css') return 'styles';
      if (ext === '.js' || ext === '.mjs') return 'scripts/vendor';
      if (FONT_EXTS.includes(ext)) return 'assets/fonts';
      return 'assets/misc';
    }
    return null;
  },
};
