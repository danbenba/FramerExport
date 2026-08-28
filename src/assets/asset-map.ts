import path from 'path';
import crypto from 'crypto';
import { URL } from 'url';
import type { PlatformHandler } from '../platforms/types.js';
interface AssetEntry {
  localPath: string;
}
const CONTENT_TYPE_EXTS: Array<[RegExp, string]> = [
  [/text\/css/i, '.css'],
  [/(?:text|application)\/(?:x-)?(?:java|ecma)script/i, '.js'],
  [/application\/json/i, '.json'],
  [/image\/svg/i, '.svg'],
  [/image\/png/i, '.png'],
  [/image\/jpe?g/i, '.jpg'],
  [/image\/gif/i, '.gif'],
  [/image\/webp/i, '.webp'],
  [/image\/avif/i, '.avif'],
  [/image\/x-icon|image\/vnd\.microsoft\.icon/i, '.ico'],
  [/font\/woff2|application\/font-woff2/i, '.woff2'],
  [/font\/woff|application\/font-woff/i, '.woff'],
  [/font\/ttf|application\/x-font-ttf/i, '.ttf'],
  [/font\/otf/i, '.otf'],
  [/video\/mp4/i, '.mp4'],
  [/video\/webm/i, '.webm'],
  [/text\/html/i, '.html'],
  [/text\/xml|application\/xml/i, '.xml'],
];
function extFromContentType(contentType: string): string {
  for (const [re, ext] of CONTENT_TYPE_EXTS) {
    if (re.test(contentType)) return ext;
  }
  return '';
}
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
const URL_BOUNDARY = /^["'`)<>\s?#&\\,;]/;
export function replaceUrl(text: string, url: string, rel: string): string {
  const parts: string[] = text.split(url);
  if (parts.length === 1) return text;
  let out: string = parts[0];
  for (let i = 1; i < parts.length; i++) {
    const next: string = parts[i];
    out += (next === '' || URL_BOUNDARY.test(next) ? rel : url) + next;
  }
  return out;
}
function replaceSitePath(text: string, sitePath: string, rel: string): string {
  const pattern = new RegExp(
    `(?<=["'(=]|,\\s?)${escapeRegex(sitePath)}(?=["')?#\\s,]|$)`,
    'g'
  );
  return text.replace(pattern, rel);
}
export class AssetMap {
  entries: Map<string, AssetEntry> = new Map();
  buffers: Map<string, Buffer> = new Map();
  localPathFor(urlStr: string, platform?: PlatformHandler, contentType?: string): string | null {
    if (this.entries.has(urlStr)) return this.entries.get(urlStr)!.localPath;
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      return null;
    }
    const host: string = parsed.hostname;
    const pathname: string = parsed.pathname;
    let ext: string = path.extname(pathname.split('?')[0]).toLowerCase();
    if (!ext && contentType) {
      ext = extFromContentType(contentType);
    }
    let dir: string | null = null;
    if (platform) {
      dir = platform.mapAssetDir(host, pathname, ext);
    }
    if (!dir) {
      dir = this.fallbackDir(host, ext);
    }
    let filename: string;
    const baseName: string = path.basename(pathname.split('?')[0]);
    const hash: string = crypto.createHash('md5').update(urlStr).digest('hex').slice(0, 6);
    if (baseName && baseName.length > 1 && baseName !== '/') {
      const clean: string = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
      filename = clean.includes('.') ? clean : `${clean}-${hash}${ext || ''}`;
    } else {
      filename = `asset-${hash}${ext || ''}`;
    }
    if ((ext === '.mjs' || ext === '.js') && baseName.includes('.')) {
      filename = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
    }
    if (filename.length > 100) {
      const extPart: string = path.extname(filename);
      filename = filename.slice(0, 93 - extPart.length) + '-' + hash + extPart;
    }
    const localPath: string = `${dir}/${filename}`;
    this.entries.set(urlStr, { localPath });
    const base: string = urlStr.split('?')[0];
    if (base !== urlStr && !this.entries.has(base)) {
      this.entries.set(base, { localPath });
    }
    return localPath;
  }
  rewrite(text: string, fromDir: string = '', siteUrl: string = ''): string {
    let origin = '';
    if (siteUrl) {
      try {
        origin = new URL(siteUrl).origin;
      } catch {}
    }
    const sorted = [...this.entries.entries()].sort((a, b) => b[0].length - a[0].length);
    let out: string = text;
    for (const [url, { localPath }] of sorted) {
      let rel: string = fromDir ? path.posix.relative(fromDir, localPath) : localPath;
      if (fromDir && !rel.startsWith('.')) rel = './' + rel;
      out = replaceUrl(out, url, rel);
      if (url.includes('&')) {
        out = replaceUrl(out, url.replace(/&/g, '&amp;'), rel);
      }
      if (origin && url.startsWith(origin + '/') && !localPath.endsWith('.html')) {
        const sitePath: string = url.slice(origin.length);
        if (sitePath.length > 2) {
          out = replaceSitePath(out, sitePath, rel);
          if (sitePath.length > 4 && rel !== sitePath.slice(1)) {
            out = replaceSitePath(out, sitePath.slice(1), rel);
          }
        }
      }
    }
    return out;
  }
  private fallbackDir(host: string, ext: string): string {
    if (host.includes('fonts.gstatic.com')) {
      return 'assets/fonts';
    }
    if (host.includes('fonts.googleapis.com')) {
      return ext === '.css' ? 'styles' : 'assets/fonts';
    }
    if (ext === '.mjs' || ext === '.js') return 'scripts/vendor';
    if (ext === '.css') return 'styles';
    if (['.woff2', '.woff', '.ttf', '.otf', '.eot'].includes(ext)) return 'assets/fonts';
    if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'].includes(ext)) {
      return 'assets/images';
    }
    if (['.mp4', '.webm', '.ogg'].includes(ext)) return 'assets/videos';
    return 'assets/misc';
  }
}
