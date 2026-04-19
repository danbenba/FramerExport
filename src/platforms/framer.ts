import type { PlatformHandler } from './types.js';

const FONT_EXTS: string[] = ['.woff2', '.woff', '.ttf', '.otf'];

export const framer: PlatformHandler = {
  name: 'framer',
  displayName: 'Framer',

  detectByUrl(url: string): boolean {
    return /\.framer\.(app|website)|framercanvas\.com/.test(url);
  },

  detectByHtml(html: string): boolean {
    return (
      html.includes('id="main"') &&
      (html.includes('framerstatic.com') || html.includes('framerusercontent.com'))
    );
  },

  stripDomains: ['events.framer.com', 'api.framer.com', 'collect.frameranalytics.com'],

  stripSelectors: [
    'script[src*="events.framer.com"]',
    '#__framer-badge-container',
    '#__framer-badge',
    'link[href*="canvas-sandbox"]',
    'script[src*="framer.com/bootstrap"]',
  ],

  stripPatterns: [
    /<div id="__framer-badge-container"[^>]*><\/div>/g,
    /<script>try\{if\(localStorage\.get\("__framer_force_showing_editorbar_since"\)\)[^<]*<\/script>/g,
  ],

  hydrationTimeout: 10000,
  needsHydrationCheck: true,

  mapAssetDir(host: string, pathname: string, ext: string): string | null {
    if (host.includes('framerusercontent.com')) {
      if (pathname.startsWith('/images/')) return 'assets/images';
      if (pathname.startsWith('/assets/')) {
        return FONT_EXTS.includes(ext) ? 'assets/fonts' : 'assets/misc';
      }
      if (pathname.startsWith('/sites/')) {
        if (ext === '.mjs' || ext === '.js') return 'scripts/vendor';
        if (ext === '.json') return 'data';
        if (ext === '.css') return 'styles';
        if (ext === '.framercms') return 'data';
        return 'assets/misc';
      }
      if (pathname.startsWith('/modules/')) {
        return ext === '.framercms' ? 'data' : 'scripts/modules';
      }
      return 'assets/misc';
    }

    if (host.includes('app.framerstatic.com')) {
      if (ext === '.css') return 'styles';
      if (ext === '.mjs' || ext === '.js') return 'scripts/vendor';
      if (ext === '.woff2' || ext === '.woff') return 'assets/fonts';
      if (ext === '.png' || ext === '.svg') return 'assets/images';
      return 'assets/misc';
    }

    if (host.includes('framercanvas.com') || host.includes('framer.com')) {
      if (ext === '.mjs' || ext === '.js') return 'scripts/vendor';
      if (ext === '.css') return 'styles';
      return 'assets/misc';
    }

    return null;
  },
};
