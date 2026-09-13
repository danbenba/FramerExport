import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { AssetMap } from '../../src/assets/asset-map.js';
import { downloadAll } from '../../src/exporter/download.js';
import { buildOutput } from '../../src/exporter/output.js';
import { injectRuntimeCms } from '../../src/exporter/runtime-cms.js';
import { injectRuntimeImports } from '../../src/exporter/runtime-imports.js';
import { framer } from '../../src/platforms/framer.js';
import type { ExporterContext } from '../../src/types.js';

test('binary CMS bytes survive misleading JavaScript MIME, browser caching and pretty-print output', async (t) => {
  const binary = Buffer.from([0, 0, 0, 10, 255, 254, 128, 195, 40, 13, 0, 244, 255]);
  let hits = 0;
  const server = http.createServer((req, res) => {
    if (req.url?.startsWith('/record.framercms')) {
      hits++;
      res
        .writeHead(200, {
          'Content-Type': 'application/javascript',
          'Access-Control-Allow-Origin': '*',
        })
        .end(binary);
    } else
      res
        .writeHead(200, { 'Content-Type': 'text/html' })
        .end('<!doctype html><html><head></head><body>CMS byte fixture</body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const url = origin + '/record.framercms?range=0-12';
  const browser = await puppeteer.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(origin);
  const responsePromise = page.waitForResponse(url);
  const pageBytes = await page.evaluate(
    async (target) => Array.from(new Uint8Array(await (await fetch(target)).arrayBuffer())),
    url
  );
  assert.deepEqual(pageBytes, [...binary]);
  const browserBuffer = await (await responsePromise).buffer();
  const assets = new AssetMap();
  const local = assets.localPathFor(url, framer, 'application/javascript')!;
  assert.match(local, /\.framercms$/);
  assert.equal(assets.contentTypes.get(url), 'application/octet-stream');

  assets.buffers.set(url, Buffer.from(browserBuffer.toString('utf8')));
  assert.notDeepEqual(assets.buffers.get(url), binary);
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'framer-cms-binary-'));
  t.after(() => fs.rm(outDir, { recursive: true, force: true, maxRetries: 3 }));
  const context = {
    assets,
    outDir,
    siteUrl: origin,
    platform: framer,
    subpages: new Map(),
    prettyPrint: true,
    ssrHTML: '<!doctype html><html><head></head><body>Binary fixture</body></html>',
  } as ExporterContext;
  await downloadAll(context);
  assert.equal(hits, 2, 'binary response must be fetched raw after browser capture');
  await buildOutput(context);
  assert.deepEqual(await fs.readFile(path.join(outDir, local)), binary);
  const cmsUrl = 'https://framerusercontent.com/cms/site/version/record.framercms';
  const mapped = new AssetMap();
  assert.equal(
    mapped.localPathFor(cmsUrl, framer, 'application/javascript'),
    'data/record.framercms'
  );
  const html = '<!doctype html><html><head></head><body></body></html>';
  assert.equal(
    injectRuntimeImports(html, mapped, 'https://source.example/'),
    html,
    'binary CMS files are not native JavaScript modules'
  );
});

test('exact public CMS GETs replay offline on root and subpages while POST/auth/range/unknown stay native', async (t) => {
  const assets = new AssetMap();
  const root = 'https://framerusercontent.com/cms/site/version/';
  const url = root + 'record.framercms';
  const ranged = url + '?range=0-2';
  const binary = Buffer.from([0, 255, 128, 254, 1, 195, 40]);
  const full = assets.localPathFor(url, framer, 'application/javascript')!;
  const slice = assets.localPathFor(ranged, framer, 'application/javascript')!;
  assert.notEqual(full, slice);
  const unsafe = 'https://api.example.com/cms/record.framercms';
  assets.localPathFor(unsafe, framer, 'application/javascript');
  const html =
    '<!doctype html><html><head><link rel="icon" href="data:,"></head><body>CMS fetch fixture</body></html>';
  const localHits: Array<{ url: string; testHeader: string | undefined }> = [];
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/subpages/post.html')
      res
        .writeHead(200, { 'Content-Type': 'text/html' })
        .end(
          injectRuntimeCms(
            html,
            assets,
            'https://source.example/blog/post',
            req.url === '/' ? '' : 'subpages'
          )
        );
    else if (req.url === '/' + full || req.url === '/' + slice) {
      localHits.push({ url: req.url!, testHeader: req.headers['x-fixture'] as string | undefined });
      res
        .writeHead(200, { 'Content-Type': 'application/octet-stream' })
        .end(req.url === '/' + full ? binary : binary.subarray(0, 3));
    } else res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const browser = await puppeteer.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setCacheEnabled(false);
  await page.setRequestInterception(true);
  const external: Array<{ url: string; method: string }> = [];
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin) {
      external.push({ url: request.url(), method: request.method() });
      void request.abort();
    } else void request.continue();
  });
  for (const route of ['/', '/subpages/post.html']) {
    await page.goto(origin + route);
    const actual = await page.evaluate(
      async (data) => {
        const full = Array.from(new Uint8Array(await (await fetch(data.url)).arrayBuffer()));
        const ranged = Array.from(
          new Uint8Array(await (await fetch(new URL(data.ranged))).arrayBuffer())
        );
        const request = Array.from(
          new Uint8Array(
            await (
              await fetch(new Request(data.url, { headers: { 'x-fixture': 'request' } }))
            ).arrayBuffer()
          )
        );
        return { full, ranged, request };
      },
      { url, ranged }
    );
    assert.deepEqual(actual, {
      full: [...binary],
      ranged: [...binary.subarray(0, 3)],
      request: [...binary],
    });
    assert.deepEqual(external, [], 'captured GETs must stay entirely offline');
    await page.evaluate(
      async (data) => {
        for (const [target, init] of [
          [data.url, { method: 'POST', body: 'test' }],
          [data.url, { headers: { Authorization: 'Bearer fixture' } }],
          [data.url, { headers: { Range: 'bytes=0-1' } }],
          [data.url, { credentials: 'include' }],
          [data.url + '?range=0-1', {}],
          [data.unsafe, {}],
        ] as Array<[string, RequestInit]>)
          await fetch(target, init).catch(() => {});
      },
      { url, unsafe }
    );
    assert.ok(
      external.some((r) => r.url === url && r.method === 'POST'),
      'POST must remain native'
    );
    assert.ok(
      external.some((r) => r.url === url + '?range=0-1'),
      'uncaptured ranges must remain native'
    );
    assert.ok(
      external.some((r) => r.url === unsafe),
      'other origins must remain native'
    );
    assert.equal(
      localHits.length,
      route === '/' ? 3 : 6,
      'bypassed requests must not read local CMS files'
    );
    external.length = 0;
  }
  assert.equal(
    localHits.filter((hit) => hit.testHeader === 'request').length,
    2,
    'Request headers must survive mapping'
  );
  assert.deepEqual(errors, []);
});
