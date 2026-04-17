import path from 'path';
import crypto from 'crypto';
import { URL } from 'url';
import type { PlatformHandler } from '../platforms/types.js';

interface AssetEntry {
  localPath: string;
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
      const rel: string = fromDir ? path.posix.relative(fromDir, localPath) : localPath;
      out = out.split(url).join(rel);
      if (url.includes('&')) {
        out = out.split(url.replace(/&/g, '&amp;')).join(rel);
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
