import fs from 'fs/promises';
import path from 'path';
import { log, warn, success } from '../logger/index.js';
import { prettifyJS } from '../formatter/prettify.js';
import { SERVE_SCRIPT } from '../server/template.js';
import type { ExporterContext } from '../types.js';

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
  const marker: string = `id="${id}"`;
  let idx: number = html.indexOf(marker);
  while (idx !== -1) {
    const tagStart: number = html.lastIndexOf('<', idx);
    if (tagStart === -1) break;

    const tagNameEnd: number = html.indexOf(' ', tagStart + 1);
    const tagName: string = html.slice(tagStart + 1, tagNameEnd).toLowerCase();

    let depth = 0;
    let i: number = tagStart;
    while (i < html.length) {
      if (
        html.startsWith(`<${tagName}`, i) &&
        (html[i + tagName.length + 1] === ' ' || html[i + tagName.length + 1] === '>')
      ) {
        depth++;
        i += tagName.length + 1;
      } else if (html.startsWith(`</${tagName}>`, i)) {
        depth--;
        if (depth === 0) {
          html = html.slice(0, tagStart) + html.slice(i + tagName.length + 3);
          break;
        }
        i += tagName.length + 3;
      } else {
        i++;
      }
    }

    idx = html.indexOf(marker);
  }
  return html;
}

function processSEO(html: string, url: string): string {
  const canonical = url.split('?')[0].replace(/\/$/, '');

  // Inject Canonical
  if (!html.includes('rel="canonical"')) {
    html = html.replace('</head>', `  <link rel="canonical" href="${canonical}">\n  </head>`);
  }

  // Inject Meta Description if missing
  if (!html.includes('name="description"')) {
    html = html.replace(
      '</head>',
      `  <meta name="description" content="Exported with Framer Export - Fast, SEO-optimized, and clean.">\n  </head>`
    );
  }

  // Inject OG Tags if missing
  if (!html.includes('property="og:')) {
    html = html.replace(
      '</head>',
      `  <meta property="og:type" content="website">\n  <meta property="og:url" content="${canonical}">\n  <meta property="og:title" content="Exported Site">\n  <meta property="og:description" content="A fast, clean version of this site, exported for performance.">\n  </head>`
    );
  }

  // Inject Robot tags
  if (!html.includes('name="robots"')) {
    html = html.replace('</head>', `  <meta name="robots" content="index, follow">\n  </head>`);
  }

  return html;
}

function stripIntegrityAndCors(html: string): string {
  html = html.replace(/\s+integrity="[^"]*"/g, '');
  html = html.replace(/\s+crossorigin="[^"]*"/g, '');
  html = html.replace(/\s+crossorigin/g, '');
  html = html.replace(/<link[^>]*rel="preconnect"[^>]*>/g, '');
  html = html.replace(/<link[^>]*rel="dns-prefetch"[^>]*>/g, '');
  html = html.replace(/<meta[^>]*content-security-policy[^>]*>/gi, '');
  return html;
}

function stripSrcsetCdnUrls(html: string): string {
  html = html.replace(/srcset="([^"]*)"/g, (_match: string, srcset: string) => {
    const cleaned: string = srcset
      .split(',')
      .map((entry: string) => entry.trim())
      .filter((entry: string) => !entry.startsWith('http'))
      .join(', ');
    return cleaned ? 'srcset="' + cleaned + '"' : '';
  });
  return html;
}

type RewritePattern = { from: RegExp; to: string };

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

/** Map crawled sub-page URLs to their exported filenames, keyed by pathname. */
function subpageRoutes(exporter: ExporterContext): Map<string, string> {
  const routes = new Map<string, string>();
  for (const [url, filename] of exporter.subpages) {
    try {
      routes.set(new URL(url).pathname.replace(/\/+$/, ''), filename);
    } catch {}
  }
  return routes;
}

/** Point internal links at the exported HTML files instead of live routes. */
export function rewriteInternalLinks(
  html: string,
  siteUrl: string,
  routes: Map<string, string>,
  fromSubpages: boolean
): string {
  const source = new URL(siteUrl);
  const sourceHost = source.hostname.replace(/^www\./, '');
  const rootPath = source.pathname.replace(/\/+$/, '') || '/';

  return html.replace(
    /<(?!link\b)([^>]*?\bhref\s*=\s*)(["'])(.*?)\2/gi,
    (match: string, prefix: string, quote: string, href: string) => {
      if (/^(javascript:|mailto:|tel:|#|data:)/i.test(href)) return match;
      let target: URL;
      try {
        target = new URL(href, siteUrl);
      } catch {
        return match;
      }

      if (target.hostname.replace(/^www\./, '') !== sourceHost) return match;

      const targetPath = target.pathname.replace(/\/+$/, '') || '/';
      if (fromSubpages && targetPath === rootPath) {
        return `<${prefix}${quote}../index.html${target.hash}${quote}`;
      }

      const filename = routes.get(targetPath);
      if (!filename) return match;
      // The hash selects a section on the destination page, so it has to survive.
      const local: string = (fromSubpages ? filename : 'subpages/' + filename) + target.hash;
      return `<${prefix}${quote}${local}${quote}`;
    }
  );
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
  html = stripIntegrityAndCors(html);
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

  html = exporter.assets.rewrite(html, fromDir);
  html = applyRewritePatterns(html, report);
  html = stripSrcsetCdnUrls(html);
  return rewriteInternalLinks(html, exporter.siteUrl, routes, fromSubpages);
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
    warn('No SSR HTML available, cannot build output');
    return;
  }

  const routes = subpageRoutes(exporter);
  const report: RewriteReport = { patterns: rewritePatterns(exporter), matched: new Set() };
  exporter.cooking?.update('Processing exported HTML...');
  html = processHtml(html, exporter, exporter.siteUrl, '', routes, false, report);
  success('Index HTML pipeline complete');

  await rewriteDownloadedFiles(exporter, report);
  await buildSubpages(exporter, routes, report);
  report.patterns.forEach(({ from }, index) => {
    if (!report.matched.has(index)) warn('Rewrite pattern matched nothing: ' + from.toString());
  });
  success('All URLs rewritten to local paths');

  exporter.cooking?.update('Pretty-printing JS files...');
  await prettifyDownloadedJS(exporter);

  exporter.cooking?.update('Writing final output...');
  log('Writing index.html (' + (html.length / 1024).toFixed(1) + ' KB)...');
  await fs.writeFile(path.join(exporter.outDir, 'index.html'), html);
  success('index.html written');

  await fs.writeFile(path.join(exporter.outDir, 'serve.js'), SERVE_SCRIPT);
  log('serve.js written');
  await fs.writeFile(
    path.join(exporter.outDir, 'package.json'),
    JSON.stringify({ type: 'module', scripts: { serve: 'node serve.js' } }, null, 2) + '\n'
  );
  log('package.json written for serve.js');
  success('Output build complete');
}

async function rewriteDownloadedFiles(
  exporter: ExporterContext,
  report: RewriteReport
): Promise<void> {
  const dirs: string[] = ['scripts/vendor', 'scripts/modules', 'styles'];
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
        content = exporter.assets.rewrite(content, dir);
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
