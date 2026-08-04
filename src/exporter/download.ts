import fs from 'fs/promises';
import path from 'path';
import { CFG } from '../config/index.js';
import { log, warn, success } from '../logger/index.js';
import { dlBuffer } from '../network/download.js';
import { pool } from '../network/pool.js';
import type { ExporterContext } from '../types.js';

export async function downloadAll(exporter: ExporterContext): Promise<void> {
  const seen: Set<string> = new Set();
  const toDownload: Array<{ url: string; localPath: string }> = [];
  for (const [url, { localPath }] of exporter.assets.entries) {
    if (seen.has(localPath)) continue;
    seen.add(localPath);
    toDownload.push({ url, localPath });
  }

  const total: number = toDownload.length;
  log('Starting download of ' + total + ' unique assets');
  log('Concurrency: ' + CFG.concurrency + ' parallel downloads');
  log('Retry policy: ' + CFG.retries + ' attempts, ' + CFG.dlTimeout + 'ms timeout');

  let ok = 0;
  let cached = 0;
  let fail = 0;
  let completed = 0;
  let lastReported = 0;

  const tasks: Array<() => Promise<void>> = toDownload.map(
    ({ url, localPath }) =>
      async (): Promise<void> => {
        const dest: string = path.join(exporter.outDir, localPath);
        await fs.mkdir(path.dirname(dest), { recursive: true });

        try {
          const buf: Buffer | undefined =
            exporter.assets.buffers.get(url) ||
            exporter.assets.buffers.get(url.split('?')[0]);
          if (buf) {
            await fs.writeFile(dest, buf);
            cached++;
            ok++;
          } else {
            const data: Buffer = await dlBuffer(url);
            await fs.writeFile(dest, data);
            ok++;
          }
        } catch (e) {
          fail++;
          if (
            !url.includes('framer.com/edit') &&
            !url.includes('framerstatic.com/editorbar')
          ) {
            warn('Download failed: ' + path.basename(localPath) + ' - ' + (e as Error).message);
          }
        }

        completed++;
        const pct: number = Math.floor((completed / total) * 100);
        if (pct >= lastReported + 10 || completed === total) {
          exporter.cooking?.update('Downloading... ' + completed + '/' + total + ' (' + pct + '%)');
          log('Download progress: ' + completed + '/' + total + ' (' + pct + '%)');
          lastReported = pct;
        }
      }
  );

  await pool(tasks, CFG.concurrency);

  success('Downloads complete: ' + ok + ' succeeded, ' + cached + ' from cache, ' + fail + ' failed');

  const totalBytes: number = [...exporter.assets.entries.values()].length;
  log('Total unique assets written to disk: ' + totalBytes);

  exporter.assets.buffers.clear();
  log('Network buffer cache cleared');
}

const SIBLING_IMPORT = /(?:import|from)\s*\(?\s*["'`]\.\/([A-Za-z0-9_.-]+\.m?js)["'`]/g;
const CHUNK_DIRS: string[] = ['scripts/vendor', 'scripts/modules'];

/**
 * Route and font chunks load lazily, so a single crawl never requests them and
 * the mirror ends up with dead `import("./chunk.mjs")` calls. Follow those
 * sibling specifiers from the JS already on disk until the graph closes.
 */
export async function downloadLazyChunks(exporter: ExporterContext): Promise<void> {
  const sourceOf: Map<string, string> = new Map();
  for (const [url, { localPath }] of exporter.assets.entries) {
    if (!sourceOf.has(localPath)) sourceOf.set(localPath, url);
  }

  let frontier: string[] = [...sourceOf.keys()].filter((p) =>
    CHUNK_DIRS.some((dir) => p.startsWith(dir + '/'))
  );
  let added = 0;

  // Each fetched chunk can name more chunks; the graph is shallow in practice.
  for (let depth = 0; depth < 5 && frontier.length > 0; depth++) {
    const next: string[] = [];

    for (const localPath of frontier) {
      let code: string;
      try {
        code = await fs.readFile(path.join(exporter.outDir, localPath), 'utf-8');
      } catch {
        continue;
      }

      for (const match of code.matchAll(SIBLING_IMPORT)) {
        let chunkUrl: string;
        try {
          chunkUrl = new URL('./' + match[1], sourceOf.get(localPath)!).href;
        } catch {
          continue;
        }
        if (exporter.assets.entries.has(chunkUrl)) continue;

        const dest: string | null = exporter.assets.localPathFor(chunkUrl, exporter.platform);
        if (!dest) continue;
        sourceOf.set(dest, chunkUrl);

        try {
          await fs.writeFile(path.join(exporter.outDir, dest), await dlBuffer(chunkUrl));
          next.push(dest);
          added++;
        } catch (e) {
          warn('Lazy chunk failed: ' + match[1] + ' - ' + (e as Error).message);
        }
      }
    }

    frontier = next;
  }

  if (added > 0) success('Lazy-loaded chunks resolved: ' + added);
}
