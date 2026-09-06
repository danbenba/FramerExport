import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AssetMap } from '../../src/assets/asset-map.js';
import { framer } from '../../src/platforms/framer.js';
import { registerHtmlResources } from '../../src/exporter/html-resources.js';
import type { ExporterContext } from '../../src/types.js';
async function makeContext(ssrHTML: string): Promise<ExporterContext> {
  const outDir: string = await fs.mkdtemp(path.join(os.tmpdir(), 'fe-html-res-'));
  await fs.mkdir(path.join(outDir, 'subpages'), { recursive: true });
  return {
    siteUrl: 'https://example.framer.app/',
    outDir,
    assets: new AssetMap(),
    browser: null,
    page: null,
    ssrHTML,
    platform: framer,
    subpages: new Map<string, string>(),
  } as ExporterContext;
}
test('registers icons declared in the root document', async () => {
  const ctx = await makeContext(
    '<link rel="apple-touch-icon" href="https://cdn.example.com/touch.png">'
  );
  await registerHtmlResources(ctx);
  assert.ok(ctx.assets.entries.has('https://cdn.example.com/touch.png'));
});
test('reads captured sub-pages from disk rather than scanning their filenames', async () => {
  const ctx = await makeContext('<html></html>');
  await fs.writeFile(
    path.join(ctx.outDir, 'subpages', 'about.html'),
    '<link rel="apple-touch-icon" href="https://cdn.example.com/about-touch.png">',
    'utf-8'
  );
  ctx.subpages.set('https://example.framer.app/about', 'about.html');
  await registerHtmlResources(ctx);
  assert.ok(
    ctx.assets.entries.has('https://cdn.example.com/about-touch.png'),
    'sub-page declared icon should be queued'
  );
});
test('resolves sub-page relative references against the sub-page URL', async () => {
  const ctx = await makeContext('<html></html>');
  await fs.writeFile(
    path.join(ctx.outDir, 'subpages', 'deep.html'),
    '<link rel="manifest" href="site.webmanifest">',
    'utf-8'
  );
  ctx.subpages.set('https://example.framer.app/blog/deep', 'deep.html');
  await registerHtmlResources(ctx);
  assert.ok(ctx.assets.entries.has('https://example.framer.app/blog/site.webmanifest'));
});
test('survives a sub-page file that cannot be read', async () => {
  const ctx = await makeContext('<link rel="icon" href="https://cdn.example.com/root.png">');
  ctx.subpages.set('https://example.framer.app/missing', 'not-written.html');
  await registerHtmlResources(ctx);
  assert.ok(ctx.assets.entries.has('https://cdn.example.com/root.png'));
});
