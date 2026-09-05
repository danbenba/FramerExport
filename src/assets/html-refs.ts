import { URL } from 'url';
/**
 * Resources that a page declares in its markup but that a browser never
 * requests while rendering it: touch icons, theme-scoped favicons, web app
 * manifests and social preview images.
 *
 * Asset discovery runs off the network log, so these are absent from the
 * asset map and keep pointing at the origin in the exported copy.
 */
const LINK_RELS: Set<string> = new Set([
  'icon',
  'shortcut',
  'apple-touch-icon',
  'apple-touch-icon-precomposed',
  'mask-icon',
  'manifest',
]);
const META_KEYS: Set<string> = new Set([
  'og:image',
  'og:image:url',
  'og:image:secure_url',
  'twitter:image',
  'twitter:image:src',
]);
const TAG_RE = /<(link|meta)\b[^>]*>/gi;
function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i');
  const m = tag.match(re);
  if (!m) return null;
  return (m[2] ?? m[3] ?? m[4] ?? '').trim();
}
function decode(value: string): string {
  return value.replace(/&amp;/g, '&');
}
/**
 * Collect every absolute http(s) URL declared by the icon, manifest and social
 * preview tags in `html`, resolved against `baseUrl`. Order is preserved and
 * duplicates are dropped.
 */
export function collectHtmlResourceUrls(html: string, baseUrl: string): string[] {
  const found: Set<string> = new Set();
  const out: string[] = [];
  for (const [tag, rawName] of html.matchAll(TAG_RE) as Iterable<RegExpMatchArray>) {
    const name: string = rawName.toLowerCase();
    let raw: string | null = null;
    if (name === 'link') {
      const rel: string | null = attr(tag, 'rel');
      if (!rel) continue;
      const tokens: string[] = rel.toLowerCase().split(/\s+/).filter(Boolean);
      if (!tokens.some((t) => LINK_RELS.has(t))) continue;
      raw = attr(tag, 'href');
    } else {
      const key: string | null = attr(tag, 'property') ?? attr(tag, 'name');
      if (!key || !META_KEYS.has(key.toLowerCase())) continue;
      raw = attr(tag, 'content');
    }
    if (!raw) continue;
    const href: string = decode(raw);
    if (!href || /^(data|blob|javascript|about):/i.test(href)) continue;
    let resolved: URL;
    try {
      resolved = new URL(href, baseUrl);
    } catch {
      continue;
    }
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') continue;
    const url: string = resolved.toString();
    if (found.has(url)) continue;
    found.add(url);
    out.push(url);
  }
  return out;
}
