const SKIP_SCHEMES = /^(javascript:|mailto:|tel:|sms:|data:|blob:|#)/i;
const NON_HTML_EXT =
  /\.(png|jpe?g|gif|webp|avif|svg|ico|bmp|tiff?|mp4|webm|mov|m4v|mp3|wav|ogg|flac|pdf|zip|rar|7z|gz|tar|css|js|mjs|json|xml|txt|woff2?|ttf|otf|eot)$/i;
export function hostKey(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}
export function normalizeInternalLink(
  href: string,
  pageUrl: string,
  baseHost: string
): string | null {
  if (!href || SKIP_SCHEMES.test(href.trim())) return null;
  let u: URL;
  try {
    u = new URL(href, pageUrl);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (hostKey(u.hostname) !== baseHost) return null;
  u.hash = '';
  const pathname = u.pathname.replace(/\/+$/, '');
  if (!pathname || pathname === '/') return null;
  if (NON_HTML_EXT.test(pathname)) return null;
  u.pathname = pathname;
  return u.href;
}
export function extractInternalLinks(html: string, pageUrl: string, baseHost: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? '').replace(/&amp;/g, '&').trim();
    const link = normalizeInternalLink(raw, pageUrl, baseHost);
    if (link) found.add(link);
  }
  return Array.from(found);
}
