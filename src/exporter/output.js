import fs from 'fs/promises';
import path from 'path';
import { CFG } from '../config/index.js';
import { log, warn } from '../logger/index.js';
import { prettifyJS } from '../formatter/prettify.js';
import { SERVE_SCRIPT } from '../server/template.js';

export async function buildOutput(exporter) {
  log('Building output...');

  let html = exporter.ssrHTML;
  if (!html) {
    warn('No SSR HTML available, cannot build output');
    return;
  }

  for (const sel of CFG.stripSelectors) {
    if (sel.includes('events.framer.com')) {
      html = html.replace(/<script[^>]*events\.framer\.com[^>]*><\/script>/g, '');
      html = html.replace(/<script[^>]*events\.framer\.com[^>]*>[^<]*<\/script>/g, '');
    } else if (sel.startsWith('.')) {
      const cls = sel.slice(1);
      const re = new RegExp(
        `<[^>]*class="[^"]*${cls}[^"]*"[^>]*>[\\s\\S]*?<\\/[^>]*>`,
        'g'
      );
      html = html.replace(re, '');
    } else if (sel.startsWith('#')) {
      const id = sel.slice(1);
      const re = new RegExp(`<[^>]*id="${id}"[^>]*>[\\s\\S]*?<\\/[^>]*>`, 'g');
      html = html.replace(re, '');
    } else if (sel.includes('editorbar')) {
      html = html.replace(/<link[^>]*editorbar[^>]*>/g, '');
    } else if (sel.includes('canvas-sandbox')) {
      html = html.replace(/<link[^>]*canvas-sandbox[^>]*>/g, '');
    } else if (sel.includes('bootstrap')) {
      html = html.replace(
        /<script[^>]*framer\.com\/bootstrap[^>]*>[^<]*<\/script>/g,
        ''
      );
    }
  }

  html = html.replace(/<div id="__framer-badge-container"[^>]*><\/div>/g, '');
  html = html.replace(
    /<a[^>]*class="w-webflow-badge"[^>]*>[\s\S]*?<\/a>/g,
    ''
  );
  html = html.replace(
    /<a[^>]*href="[^"]*webflow\.com\?utm_campaign=brandjs[^"]*"[^>]*>[\s\S]*?<\/a>/g,
    ''
  );
  html = html.replace(/<div[^>]*id="WIX_ADS"[^>]*>[\s\S]*?<\/div>/g, '');
  html = html.replace(/<div[^>]*class="wix-ads"[^>]*>[\s\S]*?<\/div>/g, '');
  html = html.replace(/<div[^>]*id="wix-badge"[^>]*>[\s\S]*?<\/div>/g, '');
  html = html.replace(
    /<script>try\{if\(localStorage\.get\("__framer_force_showing_editorbar_since"\)\)[^<]*<\/script>/g,
    ''
  );

  html = exporter.assets.rewrite(html, '');

  await rewriteDownloadedFiles(exporter);

  await prettifyDownloadedJS(exporter);

  await fs.writeFile(path.join(exporter.outDir, 'index.html'), html);
  log('  index.html written');

  await fs.writeFile(path.join(exporter.outDir, 'serve.cjs'), SERVE_SCRIPT);
  log('  serve.cjs written');
}

async function rewriteDownloadedFiles(exporter) {
  const dirs = ['scripts/framer', 'scripts/modules', 'styles'];

  for (const dir of dirs) {
    const fullDir = path.join(exporter.outDir, dir);
    let files;
    try {
      files = await fs.readdir(fullDir);
    } catch {
      continue;
    }

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!['.mjs', '.js', '.css'].includes(ext)) continue;

      const filePath = path.join(fullDir, file);
      try {
        let content = await fs.readFile(filePath, 'utf-8');
        const before = content;
        content = exporter.assets.rewrite(content, dir);
        if (content !== before) await fs.writeFile(filePath, content);
      } catch {}
    }
  }
  log('  Rewrote URLs in JS/CSS files');
}

async function prettifyDownloadedJS(exporter) {
  const OVERWRITE = true;
  const dirs = ['scripts/framer', 'scripts/modules'];
  let count = 0;

  log('Pretty-printing JS/MJS files...');

  for (const dir of dirs) {
    const fullDir = path.join(exporter.outDir, dir);
    let files;
    try {
      files = await fs.readdir(fullDir);
    } catch {
      continue;
    }

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (ext !== '.mjs' && ext !== '.js') continue;

      const filePath = path.join(fullDir, file);
      try {
        const raw = await fs.readFile(filePath, 'utf-8');

        const nlRatio = (raw.match(/\n/g) || []).length / raw.length;
        if (nlRatio > 0.05) continue;

        const pretty = await prettifyJS(raw);
        const destPath = OVERWRITE ? filePath : filePath.replace(ext, `.pretty${ext}`);

        await fs.writeFile(destPath, pretty, 'utf-8');
        count++;
      } catch (e) {
        warn(`Pretty-print skipped: ${file} - ${e.message}`);
      }
    }
  }

  log(`  Pretty-printed ${count} JS/MJS files`);
}
