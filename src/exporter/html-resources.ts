import fs from 'fs/promises';
import path from 'path';
import { CFG } from '../config/index.js';
import { log, success, warn } from '../logger/index.js';
import { collectHtmlResourceUrls } from '../assets/html-refs.js';
import type { ExporterContext } from '../types.js';
interface Document {
  html: string;
  baseUrl: string;
}
/**
 * Queue the resources a page only declares in its markup.
 *
 * Assets are discovered from the network log, so anything the browser never
 * fetches - touch icons, the dark-scheme favicon, the web app manifest, the
 * Open Graph and Twitter preview images - is missing from the asset map and
 * survives the rewrite as an absolute URL back to the origin. Registering them
 * here, before the download phase, lets the existing pipeline fetch and rewrite
 * them like any other asset.
 */
export async function registerHtmlResources(exporter: ExporterContext): Promise<void> {
  const documents: Document[] = [{ html: exporter.ssrHTML, baseUrl: exporter.siteUrl }];
  // `subpages` maps a page URL to the file it was written to, not to its markup,
  // so each captured document is read back from disk and resolved against its
  // own URL rather than the site root.
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
    for (const url of collectHtmlResourceUrls(html, baseUrl)) {
      if (exporter.assets.entries.has(url)) continue;
      let host: string;
      try {
        host = new URL(url).hostname;
      } catch {
        continue;
      }
      if (stripDomains.some((d) => host.includes(d))) continue;
      if (exporter.platform.skipAssetUrls?.some((re) => re.test(url))) continue;
      if (exporter.assets.localPathFor(url, exporter.platform)) added++;
    }
  }
  if (added > 0) {
    success('Queued ' + added + ' resource(s) declared in HTML but never requested');
  } else {
    log('No HTML-declared resources left to localise');
  }
}
