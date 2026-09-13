import path from 'node:path';
import type { AssetMap } from './asset-map.js';

interface CssReference {
  start: number;
  end: number;
  value: string;
  isImport: boolean;
}

function unescapeCss(value: string): string {
  return value.replace(/\\(?:([\da-f]{1,6})\s?|\r\n|[\n\r\f]|([\s\S]))/gi, (_, hex, char) => {
    if (!hex) return char ?? '';
    const code = parseInt(hex, 16);
    return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)
      ? '\ufffd'
      : String.fromCodePoint(code);
  });
}

function references(css: string): CssReference[] {
  const refs: CssReference[] = [];
  const tokens =
    /\/\*[\s\S]*?\*\/|@namespace\b[^;]*;|@import\b|(?:-webkit-)?image-set\s*\(|(?<![\w-])url\s*\(|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|[(),;{}]/gi;
  let importing = false;
  const functions: boolean[] = [];
  for (let token = tokens.exec(css); token; token = tokens.exec(css)) {
    const raw = token[0];
    if (raw.startsWith('/*') || /^@namespace/i.test(raw)) continue;
    if (/^@import/i.test(raw)) {
      importing = true;
      continue;
    }
    if (/^(?:-webkit-)?image-set/i.test(raw)) {
      functions.push(true);
      continue;
    }
    if (/^url/i.test(raw)) {
      let start = tokens.lastIndex;
      while (/\s/.test(css[start] ?? '') && start < css.length) start++;
      const quote = css[start] === '"' || css[start] === "'" ? css[start] : '';
      const valueStart = start + (quote ? 1 : 0);
      let end = valueStart;
      for (; end < css.length; end++) {
        if (css[end] === '\\') {
          end++;
          continue;
        }
        if (quote ? css[end] === quote : css[end] === ')') break;
      }
      let close = end + (quote ? 1 : 0);
      while (close < css.length && /\s/.test(css[close])) close++;
      if (css[close] !== ')') continue;
      refs.push({
        start,
        end: end + (quote ? 1 : 0),
        value: unescapeCss(css.slice(valueStart, end).trim()),
        isImport: importing,
      });
      importing = false;
      tokens.lastIndex = close + 1;
      continue;
    }
    if (raw[0] === '"' || raw[0] === "'") {
      if (importing || functions.at(-1)) {
        refs.push({
          start: token.index,
          end: tokens.lastIndex,
          value: unescapeCss(raw.slice(1, -1)),
          isImport: importing,
        });
      }
      importing = false;
      continue;
    }
    if (raw === '(') functions.push(false);
    if (raw === ')') functions.pop();
    if (/[;{}]/.test(raw)) {
      importing = false;
      functions.length = 0;
    }
  }
  return refs;
}

export function resolveCssUrl(value: string, baseUrl: string): URL | null {
  if (!value || value.startsWith('#')) return null;
  try {
    const resolved = new URL(value, baseUrl);
    return ['http:', 'https:'].includes(resolved.protocol) ? resolved : null;
  } catch {
    return null;
  }
}

export function collectCssResourceUrls(
  css: string,
  baseUrl: string
): Array<{ url: string; isImport: boolean }> {
  const found = new Map<string, boolean>();
  for (const ref of references(css)) {
    const resolved = resolveCssUrl(ref.value, baseUrl);
    if (!resolved) continue;
    resolved.hash = '';
    found.set(resolved.href, (found.get(resolved.href) ?? false) || ref.isImport);
  }
  return [...found].map(([url, isImport]) => ({ url, isImport }));
}

function transform(css: string, baseUrl: string, replacement: (url: URL) => string): string {
  for (const ref of references(css).reverse()) {
    const resolved = resolveCssUrl(ref.value, baseUrl);
    if (!resolved) continue;
    const quoted = JSON.stringify(replacement(resolved));
    css = css.slice(0, ref.start) + quoted + css.slice(ref.end);
  }
  return css;
}

export function absolutizeCssResourceUrls(css: string, baseUrl: string): string {
  return transform(css, baseUrl, (url) => url.href);
}

export function rewriteCssResourceUrls(
  css: string,
  sourceUrl: string,
  fromDir: string,
  assets: AssetMap
): string {
  return transform(css, sourceUrl, (url) => {
    const hash = url.hash;
    url.hash = '';
    const entry = assets.entries.get(url.href);
    if (!entry) return url.href + hash;
    let local = path.posix.relative(fromDir || '.', entry.localPath);
    if (fromDir && !local.startsWith('.')) local = './' + local;
    return local + hash;
  });
}
