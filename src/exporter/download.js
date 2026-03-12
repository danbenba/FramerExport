import fs from 'fs/promises';
import path from 'path';
import { CFG } from '../config/index.js';
import { log, warn } from '../logger/index.js';
import { dlBuffer } from '../network/download.js';
import { pool } from '../network/pool.js';

export async function downloadAll(exporter) {
  const seen = new Set();
  const toDownload = [];
  for (const [url, { localPath }] of exporter.assets.entries) {
    if (seen.has(localPath)) continue;
    seen.add(localPath);
    toDownload.push({ url, localPath });
  }

  log(`Downloading ${toDownload.length} assets...`);
  let ok = 0,
    cached = 0,
    fail = 0;

  const tasks = toDownload.map(
    ({ url, localPath }) =>
      async () => {
        const dest = path.join(exporter.outDir, localPath);
        await fs.mkdir(path.dirname(dest), { recursive: true });

        try {
          const buf =
            exporter.assets.buffers.get(url) ||
            exporter.assets.buffers.get(url.split('?')[0]);
          if (buf) {
            await fs.writeFile(dest, buf);
            cached++;
            ok++;
          } else {
            const data = await dlBuffer(url);
            await fs.writeFile(dest, data);
            ok++;
          }
        } catch (e) {
          fail++;
          if (
            !url.includes('framer.com/edit') &&
            !url.includes('framerstatic.com/editorbar')
          ) {
            warn(`Failed: ${url.slice(0, 80)} - ${e.message}`);
          }
        }
      }
  );

  await pool(tasks, CFG.concurrency);
  log(`  ${ok} ok (${cached} cached), ${fail} failed`);
  exporter.assets.buffers.clear();
}
