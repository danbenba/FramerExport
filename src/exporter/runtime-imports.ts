import path from 'node:path';
import type { AssetMap } from '../assets/asset-map.js';
import { htmlAttribute } from '../assets/html-refs.js';
import { rewriteHtmlTags } from '../assets/html-tags.js';

type Specifiers = Record<string, unknown>;
interface ImportMap {
  imports?: Specifiers;
  scopes?: Record<string, Specifiers>;
  integrity?: Specifiers;
}

function isRecord(value: unknown): value is Specifiers {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function injectRuntimeImports(
  html: string,
  assets: AssetMap,
  sourceBaseUrl: string,
  fromDir = ''
): string {
  const localPath = (value: string): string => {
    let relative = path.posix.relative(fromDir || '.', value);
    if (!relative.startsWith('.')) relative = './' + relative;
    return relative;
  };
  const captured = new Map(
    [...assets.entries].filter(
      ([url, entry]) =>
        /\.m?js$/i.test(entry.localPath) ||
        /(?:java|ecma)script/i.test(assets.contentTypes.get(url) ?? '')
    )
  );
  if (!captured.size) return html;
  const resolve = (value: string): string => {
    try {
      return new URL(value, sourceBaseUrl).href;
    } catch {
      return value;
    }
  };
  const address = (value: unknown): unknown => {
    if (typeof value !== 'string') return value;
    const absolute = resolve(value);
    const entry = assets.entries.get(absolute);
    return entry ? localPath(entry.localPath) : absolute;
  };
  const specifierKey = (value: string): string =>
    /^(?:[./]|[a-z][a-z\d+.-]*:)/i.test(value) ? resolve(value) : value;
  const mergeSpecifiers = (target: Specifiers, additions: unknown): void => {
    if (!isRecord(additions)) return;
    for (const [key, value] of Object.entries(additions)) {
      const resolvedKey = specifierKey(key);
      if (!Object.prototype.hasOwnProperty.call(target, resolvedKey))
        target[resolvedKey] = address(value);
    }
  };
  const originalImports: Specifiers = {};
  const originalScopes: Record<string, Specifiers> = {};
  const integrity: Specifiers = {};

  rewriteHtmlTags(
    html,
    (tag) => tag,
    (body, name, tag) => {
      if (name !== 'script' || htmlAttribute(tag, 'type')?.toLowerCase() !== 'importmap')
        return body;
      let parsed: ImportMap;
      try {
        parsed = JSON.parse(body);
      } catch {
        return body;
      }
      if (!isRecord(parsed)) return body;
      mergeSpecifiers(originalImports, parsed.imports);
      if (isRecord(parsed.scopes)) {
        for (const [scope, mappings] of Object.entries(parsed.scopes)) {
          const absolute = resolve(scope);
          mergeSpecifiers((originalScopes[absolute] ??= {}), mappings);
        }
      }
      if (isRecord(parsed.integrity)) {
        for (const [key, value] of Object.entries(parsed.integrity)) {
          const absolute = resolve(key);

          if (!assets.entries.has(absolute) && !(absolute in integrity))
            integrity[absolute] = value;
        }
      }
      return body;
    }
  );
  const expandPrefixes = (mappings: Specifiers): void => {
    for (const [key, value] of Object.entries(mappings)) {
      if (!key.endsWith('/') || typeof value !== 'string' || !value.endsWith('/')) continue;
      for (const [source, entry] of captured) {
        if (!source.startsWith(value)) continue;
        const alias = key + source.slice(value.length);
        if (!Object.prototype.hasOwnProperty.call(mappings, alias)) {
          mappings[alias] = localPath(entry.localPath);
        }
      }
    }
  };
  expandPrefixes(originalImports);
  Object.values(originalScopes).forEach(expandPrefixes);
  const imports: Specifiers = Object.fromEntries(
    [...captured].map(([url, entry]) => [url, localPath(entry.localPath)])
  );
  Object.assign(imports, originalImports);
  const scopes: Record<string, Specifiers> = { ...originalScopes };
  for (const [source, entry] of captured) {
    const merged: Specifiers = {};

    for (const scope of Object.keys(originalScopes).sort((a, b) => b.length - a.length)) {
      if (!source.startsWith(scope)) continue;
      for (const [key, value] of Object.entries(originalScopes[scope])) {
        if (!Object.prototype.hasOwnProperty.call(merged, key)) merged[key] = value;
      }
    }
    if (Object.keys(merged).length) scopes[localPath(entry.localPath)] = merged;
  }

  html = rewriteHtmlTags(html, (tag, name) => {
    const isMap = name === 'script' && htmlAttribute(tag, 'type')?.toLowerCase() === 'importmap';
    return isMap
      ? tag.replace(
          /(\s+type\s*=\s*)(?:"importmap"|'importmap'|importmap(?=[\s>]))/i,
          '$1"application/json"'
        )
      : tag;
  });
  const map = {
    imports,
    ...(Object.keys(scopes).length ? { scopes } : {}),
    ...(Object.keys(integrity).length ? { integrity } : {}),
  };
  const script =
    '<script type="importmap" data-export-runtime-imports>' +
    JSON.stringify(map).replace(/</g, '\\u003c') +
    '</script>';
  let injected = false;
  html = rewriteHtmlTags(html, (tag, name) => {
    if (!injected && name === 'head') {
      injected = true;
      return tag + script;
    }
    return tag;
  });
  return injected ? html : script + html;
}
