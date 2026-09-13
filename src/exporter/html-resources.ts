import fs from 'fs/promises';
import path from 'path';
import { CFG } from '../config/index.js';
import { log, success, warn } from '../logger/index.js';
import { collectHtmlResources } from '../assets/html-refs.js';
import type { ExporterContext } from '../types.js';
interface Document {
  html: string;
  baseUrl: string;
}

export async function registerHtmlResources(exporter: ExporterContext): Promise<void> {
  const documents: Document[] = [{ html: exporter.ssrHTML, baseUrl: exporter.siteUrl }];

  for (const [pageUrl, filename] of exporter.subpages) {
    const filepath: string = path.join(exporter.outDir, 'subpages', filename);
    try {
      documents.push({ html: await fs.readFile(filepath, 'utf-8'), baseUrl: pageUrl });
    } catch (e) {
      warn('Could not re-read sub-page for resource scan: ' + filename);
    }
  }
  const stripDomains: string[] = [...CFG.sharedStripDomains, ...exporter.platform.stripDomains];
  let added = 0;
  for (const { html, baseUrl } of documents) {
    if (!html) continue;
    for (const { url, contentType } of collectHtmlResources(html, baseUrl)) {
      if (exporter.assets.entries.has(url)) continue;
      let host: string;
      try {
        host = new URL(url).hostname;
      } catch {
        continue;
      }
      if (stripDomains.some((d) => host.includes(d))) continue;
      if (exporter.platform.skipAssetUrls?.some((re) => re.test(url))) continue;
      if (exporter.assets.localPathFor(url, exporter.platform, contentType)) added++;
    }
  }
  if (added > 0) {
    success('Queued ' + added + ' resource(s) declared in HTML but never requested');
  } else {
    log('No HTML-declared resources left to localise');
  }
}
