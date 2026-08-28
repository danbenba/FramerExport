import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { AssetMap } from '../../src/assets/asset-map.js';
import { buildOutput, rewriteInternalLinks } from '../../src/exporter/output.js';
import type { PlatformHandler } from '../../src/platforms/types.js';
import type { ExporterContext } from '../../src/types.js';
const ROUTES = new Map([
  ['/about', 'about.html'],
  ['/blog/post', 'blog_post.html'],
]);
test('rewriteInternalLinks rewrites protocol-relative internal URLs', () => {
  const html = '<a href="//example.com/about">About</a>';
  assert.equal(
    rewriteInternalLinks(html, 'https://example.com/', ROUTES, false),
    '<a href="subpages/about.html">About</a>'
  );
});
test('rewriteInternalLinks leaves protocol-relative external URLs alone', () => {
  const html = '<a href="//cdn.example.net/about">Ext</a>';
  assert.equal(rewriteInternalLinks(html, 'https://example.com/', ROUTES, false), html);
});
test('rewriteInternalLinks links subpage-to-subpage without the subpages/ prefix', () => {
  const html = '<a href="/blog/post">Post</a>';
  assert.equal(
    rewriteInternalLinks(html, 'https://example.com/', ROUTES, true),
    '<a href="blog_post.html">Post</a>'
  );
});
test('rewriteInternalLinks skips special schemes and bare fragments', () => {
  const html =
    '<a href="mailto:x@y.z">m</a><a href="tel:+123">t</a>' +
    '<a href="javascript:void(0)">j</a><a href="#top">f</a><a href="data:text/plain,x">d</a>';
  assert.equal(rewriteInternalLinks(html, 'https://example.com/', ROUTES, false), html);
});
test('rewriteInternalLinks normalizes trailing slashes when matching routes', () => {
  const html = '<a href="/about/">About</a>';
  assert.equal(
    rewriteInternalLinks(html, 'https://example.com/', ROUTES, false),
    '<a href="subpages/about.html">About</a>'
  );
});
test('rewriteInternalLinks treats www and bare hostnames as the same site', () => {
  const html = '<a href="https://example.com/about">About</a>';
  assert.equal(
    rewriteInternalLinks(html, 'https://www.example.com/', ROUTES, false),
    '<a href="subpages/about.html">About</a>'
  );
});
test('rewriteInternalLinks leaves unrouted internal links unchanged on the index', () => {
  const html = '<a href="/pricing">Pricing</a><a href="/">Home</a>';
  assert.equal(rewriteInternalLinks(html, 'https://example.com/', ROUTES, false), html);
});
test('rewriteInternalLinks preserves the hash on subpage-relative rewrites', () => {
  const html = '<a href="/blog/post#comments">Post</a>';
  assert.equal(
    rewriteInternalLinks(html, 'https://example.com/', ROUTES, true),
    '<a href="blog_post.html#comments">Post</a>'
  );
});
function minimalPlatform(overrides: Partial<PlatformHandler> = {}): PlatformHandler {
  return {
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
    ...overrides,
  };
}
test('buildOutput cleans attributes, injects SEO tags and writes serve files', async (t) => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'framer-export-output-test-'));
  t.after(() => fs.rm(outDir, { recursive: true, force: true, maxRetries: 3 }));
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  t.after(() => Object.assign(console, orig));
  const assets = new AssetMap();
  assets.localPathFor('https://cdn.example.com/app.js');
  const exporter: ExporterContext = {
    siteUrl: 'https://example.com/',
    outDir,
    assets,
    browser: null,
    page: null,
    prettyPrint: false,
    ssrHTML:
      '<html><head>' +
      '<script src="https://cdn.example.com/app.js" integrity="sha384-abc" crossorigin="anonymous"></script>' +
      "<link crossorigin='anonymous' rel='stylesheet' href='https://cdn.example.com/site.css'>" +
      '<link rel="preconnect" href="https://cdn.example.com">' +
      '</head><body>' +
      '<img srcset="https://cdn.example.com/w800.png 800w, local-400.png 400w">' +
      '</body></html>',
    platform: minimalPlatform(),
    subpages: new Map(),
  };
  await buildOutput(exporter);
  const index = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
  assert.match(index, /src="scripts\/vendor\/app\.js"/);
  assert.doesNotMatch(index, /integrity=/);
  assert.doesNotMatch(index, /crossorigin/);
  assert.doesNotMatch(index, /<link=/);
  assert.match(index, /<link rel='stylesheet'/);
  assert.doesNotMatch(index, /rel="preconnect"/);
  assert.doesNotMatch(index, /w800\.png/);
  assert.match(index, /srcset="local-400\.png 400w"/);
  assert.match(index, /rel="canonical" href="https:\/\/example\.com"/);
  assert.match(index, /name="description"/);
  assert.match(index, /property="og:url" content="https:\/\/example\.com"/);
  assert.match(index, /name="robots" content="index, follow"/);
  const pkg = JSON.parse(await fs.readFile(path.join(outDir, 'package.json'), 'utf8'));
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.scripts.serve, 'node serve.js');
  const serve = await fs.readFile(path.join(outDir, 'serve.js'), 'utf8');
  assert.match(serve, /http\.createServer/);
});
test('buildOutput keeps an existing canonical link untouched', async (t) => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'framer-export-canonical-test-'));
  t.after(() => fs.rm(outDir, { recursive: true, force: true, maxRetries: 3 }));
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  t.after(() => Object.assign(console, orig));
  const exporter: ExporterContext = {
    siteUrl: 'https://example.com/',
    outDir,
    assets: new AssetMap(),
    browser: null,
    page: null,
    prettyPrint: false,
    ssrHTML:
      '<html><head><link rel="canonical" href="https://original.example.com/page"></head>' +
      '<body></body></html>',
    platform: minimalPlatform(),
    subpages: new Map(),
  };
  await buildOutput(exporter);
  const index = await fs.readFile(path.join(outDir, 'index.html'), 'utf8');
  assert.match(index, /rel="canonical" href="https:\/\/original\.example\.com\/page"/);
  assert.equal(index.match(/rel="canonical"/g)?.length, 1);
});
test('buildOutput rewrites asset URLs inside downloaded vendor scripts and styles', async (t) => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'framer-export-vendor-test-'));
  t.after(() => fs.rm(outDir, { recursive: true, force: true, maxRetries: 3 }));
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  t.after(() => Object.assign(console, orig));
  await fs.mkdir(path.join(outDir, 'scripts', 'vendor'), { recursive: true });
  await fs.mkdir(path.join(outDir, 'styles'), { recursive: true });
  await fs.writeFile(
    path.join(outDir, 'scripts', 'vendor', 'main.js'),
    'import("https://cdn.example.com/chunk.mjs");\n'
  );
  await fs.writeFile(
    path.join(outDir, 'styles', 'site.css'),
    'body{background:url(https://cdn.example.com/bg.png)}\n'
  );
  const assets = new AssetMap();
  assets.localPathFor('https://cdn.example.com/chunk.mjs');
  assets.localPathFor('https://cdn.example.com/bg.png');
  const exporter: ExporterContext = {
    siteUrl: 'https://example.com/',
    outDir,
    assets,
    browser: null,
    page: null,
    prettyPrint: false,
    ssrHTML: '<html><head></head><body></body></html>',
    platform: minimalPlatform(),
    subpages: new Map(),
  };
  await buildOutput(exporter);
  const js = await fs.readFile(path.join(outDir, 'scripts', 'vendor', 'main.js'), 'utf8');
  assert.match(js, /import\("\.\/chunk\.mjs"\)/);
  const css = await fs.readFile(path.join(outDir, 'styles', 'site.css'), 'utf8');
  assert.match(css, /url\(\.\.\/assets\/images\/bg\.png\)/);
});
test('buildOutput resolves relative refs inside downloaded CSS against their source URL', async (t) => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'framer-export-cssrel-test-'));
  t.after(() => fs.rm(outDir, { recursive: true, force: true, maxRetries: 3 }));
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log = console.warn = console.error = () => {};
  t.after(() => Object.assign(console, orig));
  await fs.mkdir(path.join(outDir, 'styles'), { recursive: true });
  await fs.writeFile(
    path.join(outDir, 'styles', 'screen.css'),
    '@font-face{src:url(../fonts/poppins.woff2)}h1{background:url(theme/bg.png)}\n'
  );
  const assets = new AssetMap();
  assets.localPathFor('https://blog.ghost.io/assets/built/screen.css?v=x');
  assets.localPathFor('https://blog.ghost.io/assets/fonts/poppins.woff2');
  assets.localPathFor('https://blog.ghost.io/assets/built/theme/bg.png');
  const exporter: ExporterContext = {
    siteUrl: 'https://blog.ghost.io/',
    outDir,
    assets,
    browser: null,
    page: null,
    prettyPrint: false,
    ssrHTML: '<html><head></head><body></body></html>',
    platform: minimalPlatform(),
    subpages: new Map(),
  };
  await buildOutput(exporter);
  const css = await fs.readFile(path.join(outDir, 'styles', 'screen.css'), 'utf8');
  assert.match(css, /url\(\.\.\/assets\/fonts\/poppins\.woff2\)/);
  assert.match(css, /url\(\.\.\/assets\/images\/bg\.png\)/);
});
