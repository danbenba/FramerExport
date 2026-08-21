import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { AssetMap, replaceUrl } from '../../src/assets/asset-map.js';
import { buildOutput, rewriteInternalLinks } from '../../src/exporter/output.js';
import { framer } from '../../src/platforms/framer.js';
import type { PlatformHandler } from '../../src/platforms/types.js';
import type { ExporterContext } from '../../src/types.js';

test('replaceUrl skips a URL used only as a deeper path prefix', () => {
  const source = 'https://framer.com/edit https://framer.com/edit/init.mjs';

  assert.equal(
    replaceUrl(source, 'https://framer.com/edit', 'assets/edit'),
    'assets/edit https://framer.com/edit/init.mjs'
  );
});

test('replaceUrl rewrites adjacent query and encoded forms', () => {
  assert.equal(replaceUrl('x?a=1&amp;b=2', 'x?a=1&amp;b=2', './asset'), './asset');
});

test('rewriteInternalLinks handles both quote styles and keeps fragments', () => {
  const routes = new Map([['/about', 'about.html']]);
  const html = `<a href='/about#team'>About</a><a href="https://www.example.com/about">Again</a>`;

  assert.equal(
    rewriteInternalLinks(html, 'https://example.com/', routes, false),
    `<a href='subpages/about.html#team'>About</a><a href="subpages/about.html">Again</a>`
  );
});

test('rewriteInternalLinks leaves external URLs with matching paths unchanged', () => {
  const html = '<a href="https://cdn.example.net/about">External</a>';

  assert.equal(
    rewriteInternalLinks(html, 'https://example.com/', new Map([['/about', 'about.html']]), false),
    html
  );
});

test('rewriteInternalLinks skips canonical link elements', () => {
  const html = '<link rel="canonical" href="/about"><a href="/about">About</a>';

  assert.equal(
    rewriteInternalLinks(html, 'https://example.com/', new Map([['/about', 'about.html']]), false),
    '<link rel="canonical" href="/about"><a href="subpages/about.html">About</a>'
  );
});

test('rewriteInternalLinks points subpage root links back to index', () => {
  const html = '<a class="home" href = "/#hero">Home</a>';

  assert.equal(
    rewriteInternalLinks(html, 'https://example.com/', new Map(), true),
    '<a class="home" href = "../index.html#hero">Home</a>'
  );
});

test('Framer asset filters do not drop a site-owned init.mjs', () => {
  const shouldSkip = (url: string) => framer.skipAssetUrls?.some((pattern) => pattern.test(url));

  assert.equal(shouldSkip('https://app.framerstatic.com/runtime/init.mjs'), true);
  assert.equal(shouldSkip('https://example.com/runtime/init.mjs'), false);
});

test('buildOutput runs index and subpages through the same HTML pipeline', async (t) => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'framer-export-test-'));
  t.after(() => fs.rm(outDir, { recursive: true, force: true }));
  await fs.mkdir(path.join(outDir, 'subpages'));

  const platform: PlatformHandler = {
    name: 'unknown',
    displayName: 'Test',
    category: 'builder',
    priority: 0,
    detectByUrl: () => false,
    detectByHtml: () => false,
    stripDomains: [],
    stripSelectors: [],
    stripPatterns: [],
    hydrationTimeout: 0,
    needsHydrationCheck: false,
    mapAssetDir: () => null,
    rewriteUrlPatterns: [{ from: /OLD/g, to: 'NEW' }],
    postCapture: (html) => html.replace('</body>', '<p>postCapture</p></body>'),
  };
  const exporter: ExporterContext = {
    siteUrl: 'https://example.com/',
    outDir,
    assets: new AssetMap(),
    browser: null,
    page: null,
    ssrHTML: '<html><head></head><body>OLD<a href="/about">About</a></body></html>',
    platform,
    subpages: new Map([['https://example.com/about', 'about.html']]),
  };
  await fs.writeFile(
    path.join(outDir, 'subpages', 'about.html'),
    '<html><head></head><body>OLD<a href="/">Home</a></body></html>'
  );

  await buildOutput(exporter);

  const index = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
  const subpage = await fs.readFile(path.join(outDir, 'subpages', 'about.html'), 'utf8');
  assert.match(index, /NEW/);
  assert.match(index, /postCapture/);
  assert.match(index, /href="subpages\/about\.html"/);
  assert.match(index, /rel="canonical" href="https:\/\/example\.com"/);
  assert.match(subpage, /NEW/);
  assert.match(subpage, /postCapture/);
  assert.match(subpage, /href="\.\.\/index\.html"/);
  assert.match(subpage, /rel="canonical" href="https:\/\/example\.com\/about"/);
});
