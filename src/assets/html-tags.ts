export function rewriteHtmlTags(
  html: string,
  rewriteTag: (tag: string, name: string) => string,
  rewriteRawText?: (body: string, name: string, openingTag: string) => string
): string {
  const tags =
    /<!--[\s\S]*?(?:-->|$)|<!\[CDATA\[[\s\S]*?(?:\]\]>|$)|<([a-z][\w:-]*)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
  let result = '';
  let cursor = 0;
  for (let match = tags.exec(html); match; match = tags.exec(html)) {
    if (!match[1]) continue;
    const opening = match[0];
    const name = match[1].toLowerCase();
    result += html.slice(cursor, match.index) + rewriteTag(opening, name);
    cursor = tags.lastIndex;
    if (/^(?:script|style|textarea|title|xmp|iframe|noembed|noframes)$/.test(name)) {
      const closing = new RegExp(`</${name}\\s*>`, 'gi');
      closing.lastIndex = cursor;
      const end = closing.exec(html);
      const body = html.slice(cursor, end ? end.index : html.length);
      result += rewriteRawText ? rewriteRawText(body, name, opening) : body;
      if (end) result += end[0];
      cursor = end ? closing.lastIndex : html.length;
      tags.lastIndex = cursor;
    }
  }
  return result + html.slice(cursor);
}
