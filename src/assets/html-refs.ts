import { collectCssResourceUrls } from './css-refs.js';
import { rewriteHtmlTags } from './html-tags.js';

const LINK_RELS = new Set([
  'stylesheet',
  'icon',
  'shortcut',
  'apple-touch-icon',
  'apple-touch-icon-precomposed',
  'mask-icon',
  'manifest',
  'preload',
  'modulepreload',
]);
const META_KEYS = new Set([
  'og:image',
  'og:image:url',
  'og:image:secure_url',
  'twitter:image',
  'twitter:image:src',
]);

export function htmlAttribute(tag: string, name: string): string | null {
  const attributes = /(?:^|\s)([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  for (const match of tag.matchAll(attributes)) {
    if (match[1].toLowerCase() === name.toLowerCase()) {
      return decodeHtmlAttribute(match[3] ?? match[4] ?? match[5] ?? '');
    }
  }
  return null;
}

export function decodeHtmlAttribute(value: string): string {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, (entity) => {
    const named: Record<string, string> = {
      '&amp;': '&',
      '&quot;': '"',
      '&apos;': "'",
      '&lt;': '<',
      '&gt;': '>',
    };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const hex = entity[2].toLowerCase() === 'x';
    const code = parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '\ufffd';
  });
}

export function resolveDocumentBaseUrl(html: string, pageUrl: string): string {
  let href: string | null = null;
  rewriteHtmlTags(html, (tag, name) => {
    if (name === 'base' && href === null) href = htmlAttribute(tag, 'href');
    return tag;
  });
  try {
    return href !== null ? new URL(href, pageUrl).href : pageUrl;
  } catch {
    return pageUrl;
  }
}

export function rewriteSrcset(value: string, replacer: (url: string) => string): string {
  let output = '';
  let cursor = 0;
  while (cursor < value.length) {
    const lead = cursor;
    while (cursor < value.length && /[\s,]/.test(value[cursor])) cursor++;
    output += value.slice(lead, cursor);
    const start = cursor;
    while (cursor < value.length && !/\s/.test(value[cursor])) cursor++;
    let end = cursor;
    while (end > start && value[end - 1] === ',') end--;
    if (end > start) output += replacer(value.slice(start, end));
    output += value.slice(end, cursor);
    if (end !== cursor) continue;
    const descriptors = cursor;
    let depth = 0;
    while (cursor < value.length) {
      const char = value[cursor++];
      if (char === '(') depth++;
      else if (char === ')') depth--;
      else if (char === ',' && depth === 0) break;
    }
    output += value.slice(descriptors, cursor);
  }
  return output;
}

export interface HtmlResource {
  url: string;
  contentType?: string;
}

export function collectHtmlResources(html: string, pageUrl: string): HtmlResource[] {
  const baseUrl = resolveDocumentBaseUrl(html, pageUrl);
  const found = new Map<string, HtmlResource>();
  const add = (raw: string | null, contentType?: string): void => {
    if (!raw || raw.startsWith('#')) return;
    try {
      const resolved = new URL(raw, baseUrl);
      if (!['http:', 'https:'].includes(resolved.protocol)) return;
      resolved.hash = '';
      const previous = found.get(resolved.href);
      found.set(resolved.href, {
        url: resolved.href,
        contentType: contentType ?? previous?.contentType,
      });
    } catch {}
  };
  const addCss = (css: string): void => {
    for (const { url, isImport } of collectCssResourceUrls(css, baseUrl))
      add(url, isImport ? 'text/css' : undefined);
  };
  rewriteHtmlTags(
    html,
    (tag, name) => {
      const attr = (key: string) => htmlAttribute(tag, key);
      const inlineStyle = attr('style');
      if (inlineStyle) addCss(inlineStyle);
      if (name === 'link') {
        const rels = (attr('rel') ?? '').toLowerCase().split(/\s+/);
        if (!rels.some((rel) => LINK_RELS.has(rel))) return tag;
        const as = attr('as')?.toLowerCase();
        if (rels.includes('preload') && as === 'document') return tag;
        const type =
          rels.includes('stylesheet') || as === 'style'
            ? 'text/css'
            : rels.includes('modulepreload') || as === 'script'
              ? 'text/javascript'
              : undefined;
        add(attr('href'), type);
        const srcset = attr('imagesrcset');
        if (srcset)
          rewriteSrcset(srcset, (url) => {
            add(url);
            return url;
          });
      } else if (name === 'meta') {
        const key = attr('property') ?? attr('name');
        if (key && META_KEYS.has(key.toLowerCase())) add(attr('content'));
      } else if (
        [
          'img',
          'source',
          'video',
          'audio',
          'track',
          'input',
          'script',
          'iframe',
          'embed',
          'image',
          'use',
        ].includes(name)
      ) {
        add(
          attr('src'),
          name === 'script' ? 'text/javascript' : name === 'iframe' ? 'text/html' : undefined
        );
        if (name === 'video') add(attr('poster'));
        if (name === 'img' || name === 'source') {
          add(attr('data-src'));
          for (const key of ['srcset', 'data-srcset']) {
            const srcset = attr(key);
            if (srcset)
              rewriteSrcset(srcset, (url) => {
                add(url);
                return url;
              });
          }
        }
        if (name === 'image' || name === 'use') add(attr('href') ?? attr('xlink:href'));
      } else if (name === 'object') {
        add(attr('data'));
      }
      return tag;
    },
    (body, name, openingTag) => {
      if (name === 'style') addCss(body);
      if (name === 'script' && /(?:^|\/)json$/i.test(htmlAttribute(openingTag, 'type') ?? '')) {
        try {
          JSON.parse(body, (key, value) => {
            if (/worker(?:Url|_url|-url)$/i.test(key) && typeof value === 'string') {
              add(value, 'text/javascript');
            }
            return value;
          });
        } catch {}
      }
      return body;
    }
  );
  return [...found.values()];
}

export function collectHtmlResourceUrls(html: string, baseUrl: string): string[] {
  return collectHtmlResources(html, baseUrl).map(({ url }) => url);
}
