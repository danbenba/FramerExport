import { CFG } from '../config/index.js';
import { log, success } from '../logger/index.js';
import { collectHtmlResourceUrls } from '../assets/html-refs.js';
import type { ExporterContext } from '../types.js';
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
export function registerHtmlResources(exporter: ExporterContext): void {
  const stripDomains: string[] = [...CFG.sharedStripDomains, ...exporter.platform.stripDomains];
  const documents: string[] = [exporter.ssrHTML, ...exporter.subpages.values()];
  let added = 0;
  for (const html of documents) {
    if (!html) continue;
    for (const url of collectHtmlResourceUrls(html, exporter.siteUrl)) {
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
