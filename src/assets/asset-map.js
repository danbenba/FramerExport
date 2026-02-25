import path from 'path';
import crypto from 'crypto';
import { URL } from 'url';

export class AssetMap {
  constructor() {
    this.entries = new Map();
    this.buffers = new Map();
  }

  localPathFor(urlStr) {
    if (this.entries.has(urlStr)) return this.entries.get(urlStr).localPath;

    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch {
      return null;
    }

    const host = parsed.hostname;
    const pathname = parsed.pathname;
    const ext = path.extname(pathname.split('?')[0]).toLowerCase();

    let dir, filename;

    if (host.includes('framerusercontent.com')) {
      if (pathname.startsWith('/images/')) {
        dir = 'assets/images';
      } else if (pathname.startsWith('/assets/')) {
        dir =
          ext === '.woff2' || ext === '.woff' || ext === '.ttf' || ext === '.otf'
            ? 'assets/fonts'
            : 'assets/misc';
      } else if (pathname.startsWith('/sites/')) {
        if (ext === '.mjs' || ext === '.js') dir = 'scripts/framer';
        else if (ext === '.json') dir = 'data';
        else if (ext === '.css') dir = 'styles';
        else if (ext === '.framercms') dir = 'data';
        else dir = 'assets/misc';
      } else if (pathname.startsWith('/modules/')) {
        dir = ext === '.framercms' ? 'data' : 'scripts/modules';
      } else {
        dir = 'assets/misc';
      }
    } else if (host.includes('webflow.com')) {
      if (pathname.includes('/images/')) dir = 'assets/images';
      else if (ext === '.css') dir = 'styles';
      else if (ext === '.js') dir = 'scripts/framer';
      else dir = 'assets/misc';
    } else if (host.includes('wixstatic.com')) {
      if (
        pathname.includes('/images/') ||
        ext === '.webp' ||
        ext === '.jpg' ||
        ext === '.png'
      )
        dir = 'assets/images';
      else if (ext === '.css') dir = 'styles';
      else if (ext === '.js') dir = 'scripts/framer';
      else dir = 'assets/misc';
    } else if (host.includes('fonts.gstatic.com') || host.includes('fonts.googleapis.com')) {
      dir = 'assets/fonts';
    } else if (host.includes('app.framerstatic.com')) {
      if (ext === '.css') dir = 'styles';
      else if (ext === '.mjs' || ext === '.js') dir = 'scripts/framer';
      else if (ext === '.woff2' || ext === '.woff') dir = 'assets/fonts';
      else if (ext === '.png' || ext === '.svg') dir = 'assets/images';
      else dir = 'assets/misc';
    } else if (host.includes('framercanvas.com') || host.includes('framer.com')) {
      if (ext === '.mjs' || ext === '.js') dir = 'scripts/framer';
      else if (ext === '.css') dir = 'styles';
      else dir = 'assets/misc';
    } else {
      dir = ext === '.mjs' || ext === '.js' ? 'scripts/framer' : 'assets/misc';
    }

    const baseName = path.basename(pathname.split('?')[0]);
    const hash = crypto.createHash('md5').update(urlStr).digest('hex').slice(0, 6);

    if (baseName && baseName.length > 1 && baseName !== '/') {
      const clean = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
      filename = clean.includes('.') ? clean : `${clean}-${hash}`;
    } else {
      filename = `asset-${hash}${ext || ''}`;
    }

    if (ext === '.mjs' || ext === '.js') {
      filename = baseName.replace(/[^a-zA-Z0-9._-]/g, '_');
    }

    const localPath = `${dir}/${filename}`;
    this.entries.set(urlStr, { localPath });

    const base = urlStr.split('?')[0];
    if (base !== urlStr && !this.entries.has(base)) {
      this.entries.set(base, { localPath });
    }

    return localPath;
  }

  rewrite(text, fromDir = '') {
    const sorted = [...this.entries.entries()].sort((a, b) => b[0].length - a[0].length);
    let out = text;
    for (const [url, { localPath }] of sorted) {
      const rel = fromDir ? path.posix.relative(fromDir, localPath) : localPath;
      out = out.split(url).join(rel);
      if (url.includes('&')) {
        out = out.split(url.replace(/&/g, '&amp;')).join(rel);
      }
    }
    return out;
  }
}
