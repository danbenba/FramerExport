import fs from 'fs/promises';
import path from 'path';
import { CFG } from '../config/index.js';
import { log, warn, success } from '../logger/index.js';
import { setTotalAssets, noteDownload, noteFile } from './progress.js';
import { dlBuffer, dlResource } from '../network/download.js';
import { pool } from '../network/pool.js';
import { absolutizeCssResourceUrls, collectCssResourceUrls } from '../assets/css-refs.js';
import { collectHtmlResources, type HtmlResource } from '../assets/html-refs.js';
import type { ExporterContext } from '../types.js';

export async function downloadAll(exporter: ExporterContext): Promise<void> {
  const scheduled = new Set<string>();
  const tasks: Array<() => Promise<void>> = [];
  const stripDomains = [...CFG.sharedStripDomains, ...exporter.platform.stripDomains];
  let ok = 0;
  let cached = 0;
  let fail = 0;
  const maxAssets = 20000;
  const enqueue = (url: string, depth: number): void => {
    if (scheduled.has(url)) return;
    if (scheduled.size >= maxAssets)
      throw new Error('Resource dependency traversal exceeded ' + maxAssets + ' assets');
    scheduled.add(url);
    tasks.push(async () => {
      let localPath = exporter.assets.entries.get(url)!.localPath;
      try {
        const cachedBuffer = /\.framercms$/i.test(new URL(url).pathname)
          ? undefined
          : exporter.assets.buffers.get(url);
        let data: Buffer;
        let sourceUrl = url;
        let contentType = exporter.assets.contentTypes.get(url) ?? '';
        if (cachedBuffer) {
          data = cachedBuffer;
          cached++;
        } else {
          const resource = await dlResource(url, CFG.retries, exporter.siteUrl);
          data = resource.buffer;
          sourceUrl = resource.url;
          contentType = resource.contentType;
          localPath = exporter.assets.localPathFor(url, exporter.platform, contentType)!;
        }
        exporter.assets.responseUrls.set(url, sourceUrl);
        let refs: HtmlResource[] = [];
        if (/text\/css/i.test(contentType) || localPath.endsWith('.css')) {
          const css = data.toString('utf-8');
          refs = collectCssResourceUrls(css, sourceUrl).map((ref) => ({
            url: ref.url,
            contentType: ref.isImport ? 'text/css' : undefined,
          }));

          data = Buffer.from(absolutizeCssResourceUrls(css, sourceUrl));
        } else if (/text\/html/i.test(contentType) || /\.html?$/i.test(localPath)) {
          refs = collectHtmlResources(data.toString('utf-8'), sourceUrl);
        }
        for (const ref of refs) {
          if (exporter.assets.failures.has(ref.url)) continue;
          const host = new URL(ref.url).hostname;
          if (stripDomains.some((domain) => host.includes(domain))) continue;
          if (exporter.platform.skipAssetUrls?.some((re) => re.test(ref.url))) continue;
          if (!scheduled.has(ref.url) && depth >= 20)
            throw new Error('Resource dependency depth exceeded 20 at ' + ref.url);
          const mapped = exporter.assets.localPathFor(ref.url, exporter.platform, ref.contentType);
          if (mapped) enqueue(ref.url, depth + 1);
        }
        const dest = path.join(exporter.outDir, localPath);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, data);
        ok++;
        noteDownload(true);
        noteFile(localPath);
      } catch (error) {
        fail++;
        noteDownload(false);

        exporter.assets.entries.delete(url);
        exporter.assets.failures.set(url, (error as Error).message);
        warn('Download failed: ' + url + ' - ' + (error as Error).message);
      } finally {
        exporter.assets.buffers.delete(url);
        setTotalAssets(scheduled.size);
        exporter.cooking?.update('Downloading... ' + (ok + fail) + '/' + scheduled.size);
      }
    });
  };
  for (const url of exporter.assets.entries.keys()) enqueue(url, 0);
  setTotalAssets(scheduled.size);
  log('Starting download of ' + scheduled.size + ' assets and their CSS/HTML dependencies');
  await pool(tasks, CFG.concurrency);
  exporter.assets.buffers.clear();
  if (fail) {
    warn(
      'Downloads complete: ' + ok + ' succeeded, ' + cached + ' from cache, ' + fail + ' failed'
    );
  } else {
    success('Downloads complete: ' + ok + ' succeeded, ' + cached + ' from cache');
  }
}
const SIBLING_IMPORT = /(?:import|from)\s*\(?\s*["'`]\.\/([A-Za-z0-9_.-]+\.m?js)["'`]/g;
const MAX_CHUNK_DEPTH = 5;
export async function downloadLazyChunks(exporter: ExporterContext): Promise<void> {
  const chunkDirs = exporter.platform.lazyChunkDirs;
  if (!chunkDirs?.length) return;
  const sourceOf: Map<string, string> = new Map();
  for (const [url, { localPath }] of exporter.assets.entries) {
    if (!sourceOf.has(localPath)) sourceOf.set(localPath, url);
  }
  let frontier: string[] = [...sourceOf.keys()].filter((p) =>
    chunkDirs.some((dir) => p.startsWith(dir + '/'))
  );
  let added = 0;
  for (let depth = 0; depth < MAX_CHUNK_DEPTH && frontier.length > 0; depth++) {
    const next: string[] = [];
    const tasks = frontier.map((localPath) => async (): Promise<void> => {
      let code: string;
      try {
        code = await fs.readFile(path.join(exporter.outDir, localPath), 'utf-8');
      } catch {
        return;
      }
      for (const match of code.matchAll(SIBLING_IMPORT)) {
        let chunkUrl: string;
        try {
          chunkUrl = new URL('./' + match[1], sourceOf.get(localPath)!).href;
        } catch {
          continue;
        }
        if (exporter.assets.entries.has(chunkUrl) || exporter.assets.failures.has(chunkUrl))
          continue;
        const dest: string | null = exporter.assets.localPathFor(chunkUrl, exporter.platform);
        if (!dest) continue;
        sourceOf.set(dest, chunkUrl);
        try {
          await fs.mkdir(path.dirname(path.join(exporter.outDir, dest)), { recursive: true });
          await fs.writeFile(path.join(exporter.outDir, dest), await dlBuffer(chunkUrl));
          next.push(dest);
          added++;
          noteDownload(true);
          noteFile(dest);
        } catch (e) {
          exporter.assets.entries.delete(chunkUrl);
          exporter.assets.failures.set(chunkUrl, (e as Error).message);
          noteDownload(false);
          warn('Lazy chunk failed: ' + match[1] + ' - ' + (e as Error).message);
        }
      }
    });
    await pool(tasks, CFG.concurrency);
    frontier = next;
  }
  if (frontier.length > 0) {
    warn(
      'Lazy chunk traversal stopped at depth ' +
        MAX_CHUNK_DEPTH +
        ' with ' +
        frontier.length +
        ' chunks left to inspect'
    );
  }
  if (added > 0) success('Lazy-loaded chunks resolved: ' + added);
}
