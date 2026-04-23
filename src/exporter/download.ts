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
  log('Downloading ' + total + ' assets (concurrency: ' + CFG.concurrency + ')');

  let ok = 0;
  let cached = 0;
  let fail = 0;
  let completed = 0;

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
            warn('Failed: ' + url.slice(0, 60) + ' - ' + (e as Error).message);
          }
        }

        completed++;
        if (completed % 10 === 0 || completed === total) {
          exporter.cooking?.update('Downloading assets... (' + completed + '/' + total + ')');
          log('Downloaded ' + completed + '/' + total + ' assets');
        }
      }
  );

  await pool(tasks, CFG.concurrency);
  success(ok + ' assets downloaded (' + cached + ' from cache, ' + fail + ' failed)');
  exporter.assets.buffers.clear();
}
