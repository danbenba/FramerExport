import fs from 'fs/promises';
import path from 'path';
import { log, warn } from '../logger/index.js';
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
  log('Building output...');

  let html: string = exporter.ssrHTML;
  if (!html) {
    warn('No SSR HTML available, cannot build output');
    return;
  }

  for (const sel of exporter.platform.stripSelectors) {
    html = stripBySelector(html, sel);
  }

  for (const pattern of exporter.platform.stripPatterns) {
    html = html.replace(new RegExp(pattern.source, pattern.flags), '');
  }

  html = exporter.assets.rewrite(html, '');

  await rewriteDownloadedFiles(exporter);

  await prettifyDownloadedJS(exporter);

  await fs.writeFile(path.join(exporter.outDir, 'index.html'), html);
  log('  index.html written');

  await fs.writeFile(path.join(exporter.outDir, 'serve.cjs'), SERVE_SCRIPT);
  log('  serve.cjs written');
}

async function rewriteDownloadedFiles(exporter: ExporterContext): Promise<void> {
  const dirs: string[] = ['scripts/vendor', 'scripts/modules', 'styles'];

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
        if (content !== before) await fs.writeFile(filePath, content);
      } catch {}
    }
  }
  log('  Rewrote URLs in JS/CSS files');
}

async function prettifyDownloadedJS(exporter: ExporterContext): Promise<void> {
  const OVERWRITE = true;
  const dirs: string[] = ['scripts/vendor', 'scripts/modules'];
  let count = 0;

  log('Pretty-printing JS/MJS files...');

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
      if (ext !== '.mjs' && ext !== '.js') continue;

      const filePath: string = path.join(fullDir, file);
      try {
        const raw: string = await fs.readFile(filePath, 'utf-8');

        const nlRatio: number = (raw.match(/\n/g) || []).length / raw.length;
        if (nlRatio > 0.05) continue;

        const pretty: string = await prettifyJS(raw);
        const destPath: string = OVERWRITE ? filePath : filePath.replace(ext, `.pretty${ext}`);

        await fs.writeFile(destPath, pretty, 'utf-8');
        count++;
      } catch (e) {
        warn(`Pretty-print skipped: ${file} - ${(e as Error).message}`);
      }
    }
  }

  log(`  Pretty-printed ${count} JS/MJS files`);
}
