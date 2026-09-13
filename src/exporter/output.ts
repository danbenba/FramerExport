import fs from 'fs/promises';
import path from 'path';
import { log, warn, success } from '../logger/index.js';
import { noteFile } from './progress.js';
import { prettifyJS } from '../formatter/prettify.js';
import { SERVE_SCRIPT } from '../server/template.js';
import type { ExporterContext } from '../types.js';
import { rewriteCssResourceUrls } from '../assets/css-refs.js';
import { documentBaseUrl, rewriteHtmlResources, rewriteModuleSpecifiers } from './html-rewrite.js';
import { injectRuntimeStyles } from './runtime-styles.js';
import { injectRuntimeImports } from './runtime-imports.js';
import { injectRuntimeAssets } from './runtime-assets.js';
import { injectRuntimeCms } from './runtime-cms.js';
import { rewriteHtmlTags } from '../assets/html-tags.js';
import { decodeHtmlAttribute, htmlAttribute } from '../assets/html-refs.js';
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function stripBySelector(html: string, sel: string): string {
  if (sel.includes('[src*="')) {
    const match = sel.match(/\[src\*="([^"]+)"\]/);
    if (match) {
      const domain: string = escapeRegex(match[1]);
      html = html.replace(new RegExp(`<script[^>]*${domain}[^>]*>[^<]*<\\/script>`, 'g'), '');
      html = html.replace(new RegExp(`<script[^>]*${domain}[^>]*><\\/script>`, 'g'), '');
    }
  } else if (sel.includes('[href*="')) {
    const match = sel.match(/\[href\*="([^"]+)"\]/);
    if (match) {
      const href: string = escapeRegex(match[1]);
      html = html.replace(new RegExp(`<link[^>]*${href}[^>]*>`, 'g'), '');
    }
  } else if (sel.startsWith('.')) {
    const cls: string = escapeRegex(sel.slice(1));
    html = html.replace(
      new RegExp(`<[^>]*class="[^"]*${cls}[^"]*"[^>]*>[\\s\\S]*?<\\/[^>]*>`, 'g'),
      ''
    );
  } else if (sel.startsWith('#')) {
    const id: string = sel.slice(1);
    html = removeElementById(html, id);
  }
  return html;
}
function removeElementById(html: string, id: string): string {
  const escaped = escapeRegex(id);
  const opening = new RegExp(
    `<([a-z][\\w:-]*)\\b[^>]*\\s+id\\s*=\\s*(?:"${escaped}"|'${escaped}'|${escaped}(?=[\\s>]))[^>]*>`,
    'i'
  );
  for (;;) {
    const match = opening.exec(html);
    if (!match) break;
    const start = match.index;
    const end = start + match[0].length;
    const name = match[1];
    if (
      /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(name) ||
      /\/\s*>$/.test(match[0])
    ) {
      html = html.slice(0, start) + html.slice(end);
      continue;
    }
    const tags = new RegExp(`<(/?)${escapeRegex(name)}\\b[^>]*>`, 'gi');
    tags.lastIndex = end;
    let depth = 1;
    let close: RegExpExecArray | null;
    while ((close = tags.exec(html))) {
      depth += close[1] ? -1 : /\/\s*>$/.test(close[0]) ? 0 : 1;
      if (depth === 0) break;
    }

    if (!close || depth !== 0) break;
    html = html.slice(0, start) + html.slice(tags.lastIndex);
  }
  return html;
}
function processSEO(html: string, url: string): string {
  const canonical = url.split('?')[0].replace(/\/$/, '');
  if (!html.includes('rel="canonical"')) {
    html = html.replace('</head>', `  <link rel="canonical" href="${canonical}">\n  </head>`);
  }
  if (!html.includes('name="description"')) {
    html = html.replace(
      '</head>',
      `  <meta name="description" content="Exported with Framer Export - Fast, SEO-optimized, and clean.">\n  </head>`
    );
  }
  if (!html.includes('property="og:')) {
    html = html.replace(
      '</head>',
      `  <meta property="og:type" content="website">\n  <meta property="og:url" content="${canonical}">\n  <meta property="og:title" content="Exported Site">\n  <meta property="og:description" content="A fast, clean version of this site, exported for performance.">\n  </head>`
    );
  }
  if (!html.includes('name="robots"')) {
    html = html.replace('</head>', `  <meta name="robots" content="index, follow">\n  </head>`);
  }
  return html;
}
function stripIntegrityAndCors(html: string): string {
  html = html.replace(/\s+integrity=("[^"]*"|'[^']*')/g, '');
  html = html.replace(/\s+crossorigin=("[^"]*"|'[^']*')/g, '');
  html = html.replace(/\s+crossorigin(?=[\s>])/g, '');
  html = html.replace(/<link[^>]*rel="preconnect"[^>]*>/g, '');
  html = html.replace(/<link[^>]*rel="dns-prefetch"[^>]*>/g, '');
  html = html.replace(/<meta[^>]*content-security-policy[^>]*>/gi, '');
  return html;
}
const SHARED_STRIP_PATTERNS: RegExp[] = [
  /<script[^>]*data-cf-beacon[^>]*>[\s\S]*?<\/script>/g,
  /<script[^>]*\/cdn-cgi\/[^>]*>[\s\S]*?<\/script>/g,
  /<script[^>]*cloudflareinsights\.com[^>]*>[\s\S]*?<\/script>/g,
  /<script[^>]*src="[^"]*googletagmanager\.com[^"]*"[^>]*>[\s\S]*?<\/script>/g,
  /<script[^>]*src="[^"]*google-analytics\.com[^"]*"[^>]*>[\s\S]*?<\/script>/g,
  /<script[^>]*src="[^"]*connect\.facebook\.net[^"]*"[^>]*>[\s\S]*?<\/script>/g,
  /<script(?:\s[^>]*)?>[^<]*googletagmanager\.com\/gtm\.js[^<]*<\/script>/g,
];
function stripSharedCruft(html: string): string {
  for (const pattern of SHARED_STRIP_PATTERNS) {
    html = html.replace(new RegExp(pattern.source, pattern.flags), '');
  }
  return html;
}
type RewritePattern = {
  from: RegExp;
  to: string;
};
interface RewriteReport {
  patterns: RewritePattern[];
  matched: Set<number>;
}
function rewritePatterns(exporter: ExporterContext): RewritePattern[] {
  return exporter.platform.rewritePatterns ?? exporter.platform.rewriteUrlPatterns ?? [];
}
function applyRewritePatterns(text: string, report: RewriteReport): string {
  report.patterns.forEach(({ from, to }, index) => {
    const pattern = new RegExp(from.source, from.flags);
    if (new RegExp(from.source, from.flags).test(text)) report.matched.add(index);
    text = text.replace(pattern, to);
  });
  return text;
}
function subpageRoutes(exporter: ExporterContext): Map<string, string> {
  const routes = new Map<string, string>();
  for (const [url, filename] of exporter.subpages) {
    try {
      routes.set(new URL(url).pathname.replace(/\/+$/, ''), filename);
    } catch {}
  }
  return routes;
}
export function rewriteInternalLinks(
  html: string,
  siteUrl: string,
  routes: Map<string, string>,
  fromSubpages: boolean,
  pageUrl: string = siteUrl
): string {
  const source = new URL(siteUrl);
  const sourceHost = source.hostname.replace(/^www\./, '');
  const rootPath = source.pathname.replace(/\/+$/, '') || '/';
  return rewriteHtmlTags(html, (tag, name) => {
    if (name !== 'a' && name !== 'area') return tag;
    return tag.replace(
      /(\s+)([\w:-]+)(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'<>]+))/g,
      (
        match: string,
        space: string,
        attribute: string,
        equals: string,
        double: string | undefined,
        single: string | undefined,
        bare: string | undefined
      ) => {
        if (attribute.toLowerCase() !== 'href') return match;
        const prefix = space + attribute + equals;
        const href = decodeHtmlAttribute(double ?? single ?? bare ?? '');
        if (/^(javascript:|mailto:|tel:|#|data:)/i.test(href)) return match;
        const quote = single !== undefined ? "'" : '"';
        let target: URL;
        try {
          target = new URL(href, pageUrl);
        } catch {
          return match;
        }
        const targetPath = target.pathname.replace(/\/+$/, '') || '/';
        const sameSite =
          target.hostname.replace(/^www\./, '') === sourceHost && target.port === source.port;
        let local: string;
        if (sameSite && fromSubpages && targetPath === rootPath) {
          local = '../index.html' + target.search + target.hash;
        } else if (sameSite && routes.has(targetPath)) {
          local =
            (fromSubpages ? '' : 'subpages/') +
            routes.get(targetPath) +
            target.search +
            target.hash;
        } else {
          if (
            /^(?:[a-z][\w+.-]*:|\/\/)/i.test(href) ||
            (!fromSubpages && new URL(pageUrl).href === source.href)
          )
            return match;
          local = target.href;
        }
        const encoded = local
          .replace(/&/g, '&amp;')
          .replace(quote === '"' ? /"/g : /'/g, quote === '"' ? '&quot;' : '&#39;');
        return prefix + quote + encoded + quote;
      }
    );
  });
}
function processHtml(
  html: string,
  exporter: ExporterContext,
  pageUrl: string,
  fromDir: string,
  routes: Map<string, string>,
  fromSubpages: boolean,
  report: RewriteReport
): string {
  const baseUrl = documentBaseUrl(html, pageUrl);
  html = stripIntegrityAndCors(html);
  html = stripSharedCruft(html);
  html = processSEO(html, pageUrl);
  for (const sel of exporter.platform.stripSelectors) html = stripBySelector(html, sel);
  for (const pattern of exporter.platform.stripPatterns) {
    html = html.replace(new RegExp(pattern.source, pattern.flags), '');
  }
  for (const pattern of exporter.platform.stripScripts || []) {
    html = html.replace(new RegExp(pattern.source, pattern.flags), '');
  }
  if (exporter.platform.postCapture) {
    try {
      html = exporter.platform.postCapture(html, exporter);
    } catch (e) {
      warn('postCapture hook failed for ' + pageUrl + ': ' + (e as Error).message);
    }
  }
  html = rewriteInternalLinks(html, exporter.siteUrl, routes, fromSubpages, baseUrl);
  html = rewriteHtmlResources(html, baseUrl, fromDir, exporter.assets);
  html = applyRewritePatterns(html, report);
  html = injectRuntimeStyles(html, exporter.assets, baseUrl, fromDir);
  html = injectRuntimeAssets(html, exporter.assets, baseUrl, fromDir);
  html = injectRuntimeCms(html, exporter.assets, baseUrl, fromDir);
  return injectRuntimeImports(html, exporter.assets, baseUrl, fromDir);
}
async function buildSubpages(
  exporter: ExporterContext,
  routes: Map<string, string>,
  report: RewriteReport
): Promise<void> {
  if (exporter.subpages.size === 0) return;
  let built = 0;
  for (const [pageUrl, filename] of exporter.subpages) {
    const filePath: string = path.join(exporter.outDir, 'subpages', filename);
    try {
      let html: string = await fs.readFile(filePath, 'utf-8');
      html = processHtml(html, exporter, pageUrl, 'subpages', routes, true, report);
      await fs.writeFile(filePath, html, 'utf-8');
      built++;
    } catch (e) {
      warn('Sub-page post-processing skipped: ' + filename + ' - ' + (e as Error).message);
    }
  }
  success('Sub-pages linked to local assets: ' + built + '/' + exporter.subpages.size);
}
export async function buildOutput(exporter: ExporterContext): Promise<void> {
  exporter.cooking?.update('Stripping platform badges...');
  log('Starting HTML post-processing...');
  log('HTML size: ' + (exporter.ssrHTML.length / 1024).toFixed(1) + ' KB');
  let html: string = exporter.ssrHTML;
  if (!html) {
    throw new Error(
      'No page HTML captured (SSR fetch failed and no rendered DOM available), cannot build output'
    );
  }
  const routes = subpageRoutes(exporter);
  const report: RewriteReport = { patterns: rewritePatterns(exporter), matched: new Set() };
  exporter.cooking?.update('Processing exported HTML...');
  html = processHtml(html, exporter, exporter.siteUrl, '', routes, false, report);
  success('Index HTML pipeline complete');
  await rewriteDownloadedFiles(exporter, report);
  await rewriteEmbeddedHtmlAssets(exporter);
  await buildSubpages(exporter, routes, report);
  report.patterns.forEach(({ from }, index) => {
    if (!report.matched.has(index)) warn('Rewrite pattern matched nothing: ' + from.toString());
  });
  success('Captured asset URLs rewritten to local paths');
  if (exporter.prettyPrint !== false) {
    exporter.cooking?.update('Pretty-printing JS files...');
    await prettifyDownloadedJS(exporter);
  } else {
    log('Pretty-print disabled, keeping JS files as downloaded');
  }
  exporter.cooking?.update('Writing final output...');
  log('Writing index.html (' + (html.length / 1024).toFixed(1) + ' KB)...');
  await fs.writeFile(path.join(exporter.outDir, 'index.html'), html);
  noteFile('index.html');
  success('index.html written');
  await fs.writeFile(path.join(exporter.outDir, 'serve.js'), SERVE_SCRIPT);
  noteFile('serve.js');
  log('serve.js written');
  await fs.writeFile(
    path.join(exporter.outDir, 'package.json'),
    JSON.stringify({ type: 'module', scripts: { serve: 'node serve.js' } }, null, 2) + '\n'
  );
  noteFile('package.json');
  log('package.json written for serve.js');
  const failures = [...exporter.assets.failures].map(([url, message]) => ({ url, message }));
  const captureMode = exporter.platform.captureRenderedDom
    ? 'static-snapshot'
    : 'html-with-runtime';
  await fs.writeFile(
    path.join(exporter.outDir, 'export-report.json'),
    JSON.stringify(
      {
        source: exporter.siteUrl,
        platform: exporter.platform.name,
        captureMode,
        generatedAt: new Date().toISOString(),
        assets: new Set([...exporter.assets.entries.values()].map((entry) => entry.localPath)).size,
        failedAssets: failures,
        subpages: exporter.subpages.size,
        visualValidation: 'not-run',
        limitations: [
          'Server-side accounts, payments, search and form processing are not exported.',
          ...(captureMode === 'static-snapshot'
            ? [
                'Platform scripts are frozen to preserve rendering; platform app interactions require rebuilding.',
              ]
            : []),
          ...(failures.length
            ? ['Some assets could not be saved; remote fallback URLs may require network access.']
            : []),
        ],
      },
      null,
      2
    ) + '\n'
  );
  noteFile('export-report.json');
  if (failures.length)
    warn(`${failures.length} asset(s) could not be saved. See export-report.json.`);
  if (captureMode === 'static-snapshot')
    warn(
      'Static snapshot: platform account flows and app interactions are not included. See export-report.json.'
    );
  success('Output build complete');
}
async function rewriteDownloadedFiles(
  exporter: ExporterContext,
  report: RewriteReport
): Promise<void> {
  const dirs: string[] = ['scripts/vendor', 'scripts/modules', 'styles'];
  const sourceByLocal = new Map<string, string>();
  for (const [url, entry] of exporter.assets.entries) {
    if (!sourceByLocal.has(entry.localPath)) sourceByLocal.set(entry.localPath, url);
  }
  let rewritten = 0;
  for (const dir of dirs) {
    const fullDir: string = path.join(exporter.outDir, dir);
    let files: string[];
    try {
      files = await fs.readdir(fullDir);
    } catch {
      continue;
    }
    for (const file of files) {
      const ext: string = path.extname(file).toLowerCase();
      if (!['.mjs', '.js', '.css'].includes(ext)) continue;
      const filePath: string = path.join(fullDir, file);
      try {
        let content: string = await fs.readFile(filePath, 'utf-8');
        const before: string = content;
        const sourceUrl = sourceByLocal.get(`${dir}/${file}`);
        if (ext === '.css') {
          content = rewriteCssResourceUrls(
            content,
            sourceUrl ?? exporter.siteUrl,
            dir,
            exporter.assets
          );
        } else {
          if (sourceUrl)
            content = rewriteModuleSpecifiers(content, sourceUrl, dir, exporter.assets);
          content = exporter.assets.rewrite(content, dir, exporter.siteUrl);
        }
        content = applyRewritePatterns(content, report);
        if (content !== before) {
          await fs.writeFile(filePath, content);
          rewritten++;
        }
      } catch {}
    }
  }
  log('Rewrote URLs in ' + rewritten + ' JS/CSS files');
}
export async function rewriteEmbeddedHtmlAssets(exporter: ExporterContext): Promise<void> {
  const rewritten = new Set<string>();
  for (const [url, entry] of exporter.assets.entries) {
    if (rewritten.has(entry.localPath) || !/\.html?$/i.test(entry.localPath)) continue;
    const filePath = path.join(exporter.outDir, entry.localPath);
    let html = await fs.readFile(filePath, 'utf-8');
    const baseUrl = documentBaseUrl(html, exporter.assets.responseUrls.get(url) ?? url);
    const fromDir = path.posix.dirname(entry.localPath);

    html = stripIntegrityAndCors(html);
    html = rewriteHtmlTags(
      html,
      (tag, name) => {
        if (name !== 'a' && name !== 'area') return tag;
        const href = htmlAttribute(tag, 'href');
        if (!href || /^(?:#|[a-z][\w+.-]*:)/i.test(href)) return tag;
        try {
          const absolute = new URL(href, baseUrl).href
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;');
          return tag.replace(
            /(\s+href\s*=\s*)(?:"[^"]*"|'[^']*'|[^\s>]+)/i,
            (_match, prefix: string) => prefix + '"' + absolute + '"'
          );
        } catch {
          return tag;
        }
      },
      (body, name, opening) =>
        name === 'script' && htmlAttribute(opening, 'type')?.toLowerCase() === 'module'
          ? rewriteModuleSpecifiers(body, baseUrl, fromDir, exporter.assets)
          : body
    );
    html = rewriteHtmlResources(html, baseUrl, fromDir, exporter.assets);
    html = injectRuntimeStyles(html, exporter.assets, baseUrl, fromDir);
    html = injectRuntimeAssets(html, exporter.assets, baseUrl, fromDir);
    html = injectRuntimeCms(html, exporter.assets, baseUrl, fromDir);
    html = injectRuntimeImports(html, exporter.assets, baseUrl, fromDir);
    await fs.writeFile(filePath, html);
    rewritten.add(entry.localPath);
  }
  if (rewritten.size) log('Rewrote resources in ' + rewritten.size + ' embedded HTML documents');
}

async function prettifyDownloadedJS(exporter: ExporterContext): Promise<void> {
  const dirs: string[] = ['scripts/vendor', 'scripts/modules'];
  let count = 0;
  let total = 0;
  for (const dir of dirs) {
    const fullDir: string = path.join(exporter.outDir, dir);
    let files: string[];
    try {
      files = await fs.readdir(fullDir);
    } catch {
      continue;
    }
    const jsFiles: string[] = files.filter((f) => {
      const ext: string = path.extname(f).toLowerCase();
      return ext === '.mjs' || ext === '.js';
    });
    total += jsFiles.length;
    for (const file of jsFiles) {
      const filePath: string = path.join(fullDir, file);
      try {
        const raw: string = await fs.readFile(filePath, 'utf-8');
        const nlRatio: number = (raw.match(/\n/g) || []).length / raw.length;
        if (nlRatio > 0.05) {
          count++;
          continue;
        }
        const pretty: string = await prettifyJS(raw);
        await fs.writeFile(filePath, pretty, 'utf-8');
        count++;
        if (count % 5 === 0) {
          exporter.cooking?.update('Pretty-printing... (' + count + '/' + total + ')');
        }
      } catch (e) {
        warn('Pretty-print skipped: ' + file + ' - ' + (e as Error).message);
        count++;
      }
    }
  }
  success('Formatted ' + count + '/' + total + ' JS/MJS files');
}
