import path from 'node:path';
import type { AssetMap } from '../assets/asset-map.js';
import { rewriteCssResourceUrls } from '../assets/css-refs.js';
import {
  decodeHtmlAttribute,
  htmlAttribute,
  resolveDocumentBaseUrl,
  rewriteSrcset,
} from '../assets/html-refs.js';
import { rewriteHtmlTags } from '../assets/html-tags.js';
import { parsers } from 'prettier/plugins/babel';
import type { ParserOptions } from 'prettier';

export const documentBaseUrl = resolveDocumentBaseUrl;

export function rewriteHtmlResources(
  html: string,
  baseUrl: string,
  fromDir: string,
  assets: AssetMap
): string {
  const resource = (value: string): string => {
    if (!value || /^(?:data:|blob:|javascript:|mailto:|tel:|#)/i.test(value)) return value;
    try {
      const url = new URL(value, baseUrl);
      const fragment = url.hash;
      url.hash = '';
      const entry = assets.entries.get(url.href);
      if (!entry) return url.href + fragment;
      let relative = fromDir ? path.posix.relative(fromDir, entry.localPath) : entry.localPath;
      if (fromDir && !relative.startsWith('.')) relative = './' + relative;
      return relative + fragment;
    } catch {
      return value;
    }
  };
  const rewriteTag = (tag: string): string => {
    const rels = (htmlAttribute(tag, 'rel') ?? '').toLowerCase().split(/\s+/);
    const metaKey = htmlAttribute(tag, 'property') ?? htmlAttribute(tag, 'name') ?? '';
    return tag.replace(
      /(\s)([\w:-]+)(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g,
      (
        match,
        space: string,
        name: string,
        equals: string,
        double: string | undefined,
        single: string | undefined,
        bare: string | undefined
      ) => {
        const raw = double ?? single ?? bare ?? '';
        const key = name.toLowerCase();
        if (key === 'href' && /^<base\b/i.test(tag)) return '';
        let value = raw;
        if (key === 'style') {
          value = rewriteCssResourceUrls(decodeHtmlAttribute(raw), baseUrl, fromDir, assets);
        } else if (
          ['src', 'poster', 'data-src', 'data-poster'].includes(key) ||
          (key === 'data' && /^<object\b/i.test(tag)) ||
          (['href', 'xlink:href'].includes(key) &&
            /^<(?:link|use|image)\b/i.test(tag) &&
            !rels.some((rel) => ['canonical', 'alternate'].includes(rel))) ||
          (key === 'content' &&
            /^<meta\b/i.test(tag) &&
            /^(?:og:image(?::(?:url|secure_url))?|twitter:image(?::src)?)$/i.test(metaKey))
        ) {
          value = resource(decodeHtmlAttribute(raw));
        } else if (['srcset', 'imagesrcset', 'data-srcset'].includes(key)) {
          value = rewriteSrcset(decodeHtmlAttribute(raw), resource);
        } else if (key === 'action' || key === 'formaction') {
          try {
            value = new URL(decodeHtmlAttribute(raw), baseUrl).href;
          } catch {}
        }
        if (value === raw) return match;
        return `${space}${name}${equals}"${value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}"`;
      }
    );
  };
  return rewriteHtmlTags(html, rewriteTag, (body, name, opening) => {
    if (name === 'style') return rewriteCssResourceUrls(body, baseUrl, fromDir, assets);
    if (name === 'script' && /(?:^|\/)json$/i.test(htmlAttribute(opening, 'type') ?? '')) {
      try {
        let changed = false;
        const data = JSON.parse(body, (_key, value) => {
          if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return value;
          const target = new URL(value);
          target.hash = '';
          const entry = assets.entries.get(target.href);
          if (!entry || entry.localPath.endsWith('.html')) return value;
          changed = true;
          return resource(value);
        });

        if (changed) return JSON.stringify(data).replace(/</g, '\\u003c');
        return body;
      } catch {}
    }

    if (name === 'script' && htmlAttribute(opening, 'type')?.toLowerCase() !== 'importmap') {
      return assets.rewrite(body, fromDir);
    }
    return body;
  });
}

export function rewriteModuleSpecifiers(
  code: string,
  sourceUrl: string,
  fromDir: string,
  assets: AssetMap
): string {
  if (!/\b(?:import|export)\b/.test(code)) return code;

  interface Node {
    type?: string;
    start?: number;
    end?: number;
    value?: string;
    source?: Node;
    callee?: Node;
    arguments?: Node[];
    expressions?: Node[];
    quasis?: Array<{ value: { cooked?: string; raw: string } }>;
    [key: string]: unknown;
  }
  let ast: Node;
  try {
    ast = parsers.babel.parse(code, {} as ParserOptions) as Node;
  } catch {
    return code;
  }
  const stack: Node[] = [ast];
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  while (stack.length) {
    const node = stack.pop()!;
    let literal: Node | undefined;
    if (
      [
        'ImportDeclaration',
        'ExportNamedDeclaration',
        'ExportAllDeclaration',
        'ImportExpression',
      ].includes(node.type ?? '')
    )
      literal = node.source;
    else if (node.type === 'CallExpression' && node.callee?.type === 'Import')
      literal = node.arguments?.[0];
    const specifier =
      literal?.type === 'StringLiteral'
        ? literal.value
        : literal?.type === 'TemplateLiteral' && literal.expressions?.length === 0
          ? literal.quasis?.[0]?.value.cooked
          : undefined;
    if (
      specifier &&
      /^\.{1,2}\//.test(specifier) &&
      typeof literal?.start === 'number' &&
      typeof literal.end === 'number'
    ) {
      try {
        const url = new URL(specifier, sourceUrl);
        const fragment = url.hash;
        url.hash = '';
        const entry = assets.entries.get(url.href);
        if (entry) {
          let relative = path.posix.relative(fromDir, entry.localPath);
          if (!relative.startsWith('.')) relative = './' + relative;
          replacements.push({
            start: literal.start,
            end: literal.end,
            value: JSON.stringify(relative + fragment),
          });
        }
      } catch {}
    }
    for (const [key, value] of Object.entries(node)) {
      if (
        [
          'loc',
          'extra',
          'comments',
          'leadingComments',
          'trailingComments',
          'innerComments',
          'tokens',
          'errors',
        ].includes(key)
      )
        continue;
      if (Array.isArray(value)) {
        for (const item of value)
          if (item && typeof item === 'object' && 'type' in item) stack.push(item as Node);
      } else if (value && typeof value === 'object' && 'type' in value) stack.push(value as Node);
    }
  }
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    code = code.slice(0, replacement.start) + replacement.value + code.slice(replacement.end);
  }
  return code;
}
