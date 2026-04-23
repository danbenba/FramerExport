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
      if (html.startsWith(`<${tagName}`, i) && (html[i + tagName.length + 1] === ' ' || html[i + tagName.length + 1] === '>')) {
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

export async function buildOutput(exporter: ExporterContext): Promise<void> {
  exporter.cooking?.update('Stripping platform badges...');
  log('Stripping ' + exporter.platform.stripSelectors.length + ' badge/editor selectors');

  let html: string = exporter.ssrHTML;
  if (!html) {
    warn('No SSR HTML available, cannot build output');
    return;
  }

  for (const sel of exporter.platform.stripSelectors) {
    html = stripBySelector(html, sel);
  }

  log('Applying ' + exporter.platform.stripPatterns.length + ' regex strip patterns');
  for (const pattern of exporter.platform.stripPatterns) {
    html = html.replace(new RegExp(pattern.source, pattern.flags), '');
  }
  success('Platform badges and tracking stripped');

  exporter.cooking?.update('Rewriting asset URLs...');
  log('Rewriting CDN URLs to local paths...');
  html = exporter.assets.rewrite(html, '');

  await rewriteDownloadedFiles(exporter);
  success('All URLs rewritten to local paths');

  exporter.cooking?.update('Pretty-printing JS files...');
  await prettifyDownloadedJS(exporter);

  exporter.cooking?.update('Writing output files...');
  await fs.writeFile(path.join(exporter.outDir, 'index.html'), html);
  log('Written index.html');

  await fs.writeFile(path.join(exporter.outDir, 'serve.cjs'), SERVE_SCRIPT);
  log('Written serve.cjs');
}

async function rewriteDownloadedFiles(exporter: ExporterContext): Promise<void> {
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
