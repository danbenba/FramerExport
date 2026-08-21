import path from 'path';
import crypto from 'crypto';
import { URL } from 'url';
import type { PlatformHandler } from '../platforms/types.js';

interface AssetEntry {
  localPath: string;
}

/**
 * Replace every occurrence of `url`, except where it is only the prefix of a
 * deeper path: `https://framer.com/edit` also matches inside
 * `https://framer.com/edit/init.mjs`, and rewriting that one would point a live
 * module at a mirrored file that never had such a child.
 */
export function replaceUrl(text: string, url: string, rel: string): string {
  const parts: string[] = text.split(url);
  if (parts.length === 1) return text;

  let out: string = parts[0];
  for (let i = 1; i < parts.length; i++) {
    out += (parts[i].startsWith('/') ? url : rel) + parts[i];
  }
  return out;
}

export class AssetMap {
  entries: Map<string, AssetEntry> = new Map();
  buffers: Map<string, Buffer> = new Map();

  localPathFor(urlStr: string, platform?: PlatformHandler): string | null {
    if (this.entries.has(urlStr)) return this.entries.get(urlStr)!.localPath;

    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      return null;
    }

    const host: string = parsed.hostname;
    const pathname: string = parsed.pathname;
    const ext: string = path.extname(pathname.split('?')[0]).toLowerCase();

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
      filename = clean.includes('.') ? clean : `${clean}-${hash}`;
    } else {
      filename = `asset-${hash}${ext || ''}`;
    }

    if (ext === '.mjs' || ext === '.js') {
      filename = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
    }

    const localPath: string = `${dir}/${filename}`;
    this.entries.set(urlStr, { localPath });

    const base: string = urlStr.split('?')[0];
    if (base !== urlStr && !this.entries.has(base)) {
      this.entries.set(base, { localPath });
    }

    return localPath;
  }

  rewrite(text: string, fromDir: string = ''): string {
    const sorted = [...this.entries.entries()].sort((a, b) => b[0].length - a[0].length);
    let out: string = text;
    for (const [url, { localPath }] of sorted) {
      let rel: string = fromDir ? path.posix.relative(fromDir, localPath) : localPath;
      // A same-directory path must stay explicitly relative, or JS dynamic
      // imports treat it as a bare module specifier and fail to resolve.
      if (fromDir && !rel.startsWith('.')) rel = './' + rel;
      out = replaceUrl(out, url, rel);
      if (url.includes('&')) {
        out = replaceUrl(out, url.replace(/&/g, '&amp;'), rel);
      }
    }
    return out;
  }

  private fallbackDir(host: string, ext: string): string {
    if (host.includes('fonts.gstatic.com') || host.includes('fonts.googleapis.com')) {
      return 'assets/fonts';
    }
    return ext === '.mjs' || ext === '.js' ? 'scripts/vendor' : 'assets/misc';
  }
}
