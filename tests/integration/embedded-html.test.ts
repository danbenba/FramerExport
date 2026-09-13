import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { AssetMap } from '../../src/assets/asset-map.js';
import { collectHtmlResources } from '../../src/assets/html-refs.js';
import { downloadAll } from '../../src/exporter/download.js';
import { buildOutput } from '../../src/exporter/output.js';
import { framer } from '../../src/platforms/framer.js';
import type { ExporterContext } from '../../src/types.js';

test('embedded HTML follows redirected bases and nested CSS/frames, then runs with the source offline', async (t) => {
  const hits: string[] = [];
  const source = http.createServer((req, res) => {
    const url = req.url!;
    hits.push(url);
    if (url === '/frame-start')
      return void res.writeHead(302, { location: '/embed/frame.html' }).end();
    const resources: Record<string, [string, string]> = {
      '/embed/frame.html': [
        'text/html',
        `<!doctype html><html><head><base href='./public/' target='_blank'><link rel='stylesheet' href='theme.css' integrity='invalid'><script defer src='app.js'></script></head><body><h1 id='result'>Loading</h1><div class='mobile'></div><iframe title='nested' src='nested.html'></iframe><a href='/navigation-only'>Navigation</a><form action='/submit-only'></form><script>document.body.dataset.inline='preserved'</script><script type='module'>import './app.js';document.body.dataset.module='preserved'</script></body></html>`,
      ],
      '/embed/public/theme.css': [
        'text/css',
        '@import "nested/colors.css"; .mobile{width:20px;height:20px}@media(max-width:600px){.mobile{background-image:url(mobile.svg)}}',
      ],
      '/embed/public/nested/colors.css': ['text/css', 'h1{color:rgb(12,34,56)}'],
      '/embed/public/app.js': [
        'text/javascript',
        'document.querySelector("#result").textContent="Embedded script works"',
      ],
      '/embed/public/mobile.svg': [
        'image/svg+xml',
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path fill="lime" d="M0 0h20v20H0z"/></svg>',
      ],
      '/embed/public/nested.html': [
        'text/html',
        '<!doctype html><html><head><style>p{color:rgb(90,80,70)}</style><script defer src="nested/app.js"></script></head><body><p id="nested">Waiting</p></body></html>',
      ],
      '/embed/public/nested/app.js': [
        'text/javascript',
        'document.querySelector("#nested").textContent="Nested script works"',
      ],
    };
    const resource = resources[url];
    if (resource) res.writeHead(200, { 'content-type': resource[0] }).end(resource[1]);
    else res.writeHead(404).end('unexpected ' + url);
  });
  await new Promise<void>((resolve) => source.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(source.address() as import('node:net').AddressInfo).port}`;
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fe-embedded-html-'));
  t.after(async () => {
    source.closeAllConnections();
    source.close();
    await fs.rm(outDir, { recursive: true, force: true });
  });
  const assets = new AssetMap();
  const html = `<!doctype html><html><head><link rel='icon' href='data:,'></head><body><iframe title='outer' style='width:100%;height:600px;border:0' src='${origin}/frame-start'></iframe></body></html>`;
  for (const resource of collectHtmlResources(html, origin))
    assets.localPathFor(resource.url, framer, resource.contentType);
  const ctx = {
    siteUrl: origin,
    outDir,
    assets,
    platform: framer,
    ssrHTML: html,
    subpages: new Map(),
    prettyPrint: false,
  } as ExporterContext;
  await downloadAll(ctx);
  await buildOutput(ctx);
  assert.equal(assets.failures.size, 0);
  assert.equal(assets.responseUrls.get(origin + '/frame-start'), origin + '/embed/frame.html');
  assert.ok(assets.entries.has(origin + '/embed/public/mobile.svg'));
  assert.ok(!hits.includes('/navigation-only') && !hits.includes('/submit-only'));
  assert.ok(hits.includes('/embed/public/nested/app.js'));
  await new Promise<void>((resolve) => source.close(() => resolve()));
  const preview = http.createServer(async (req, res) => {
    try {
      const filename = new URL(req.url!, 'http://localhost').pathname;
      const data = await fs.readFile(path.join(outDir, filename === '/' ? 'index.html' : filename));
      const types: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
      };
      res
        .writeHead(200, { 'content-type': types[path.extname(filename)] || 'text/html' })
        .end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => preview.listen(0, '127.0.0.1', resolve));
  const local = `http://127.0.0.1:${(preview.address() as import('node:net').AddressInfo).port}`;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const failures: string[] = [];
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('requestfailed', (request) => failures.push(request.url()));
    page.on('response', (response) => {
      if (response.status() >= 400) failures.push(response.url());
    });
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== local) {
        failures.push(request.url());
        void request.abort();
      } else void request.continue();
    });
    for (const width of [1440, 390]) {
      await page.setViewport({ width, height: 800 });
      await page.goto(local, { waitUntil: 'networkidle0' });
      const outer = page.frames().find((frame) => frame.parentFrame() === page.mainFrame())!;
      assert.ok(outer);
      const actual = await outer.evaluate(() => ({
        text: document.querySelector('#result')!.textContent,
        color: getComputedStyle(document.querySelector('#result')!).color,
        image: getComputedStyle(document.querySelector('.mobile')!).backgroundImage,
        inline: document.body.dataset.inline,
        module: document.body.dataset.module,
        form: (document.querySelector('form') as HTMLFormElement).action,
        navigation: (document.querySelector('a') as HTMLAnchorElement).href,
        target: document.querySelector('base')!.target,
      }));
      assert.equal(actual.text, 'Embedded script works');
      assert.equal(actual.color, 'rgb(12, 34, 56)');
      assert.equal(actual.inline, 'preserved');
      assert.equal(actual.module, 'preserved');
      assert.equal(actual.form, origin + '/submit-only');
      assert.equal(actual.navigation, origin + '/navigation-only');
      assert.equal(actual.target, '_blank');
      if (width === 390) assert.ok(actual.image.includes(local));
      const nested = outer.childFrames()[0];
      assert.equal(
        await nested.$eval('#nested', (element) => element.textContent),
        'Nested script works'
      );
    }
    assert.deepEqual(failures, []);
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => preview.close(() => resolve()));
  }
});
