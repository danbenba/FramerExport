import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { AssetMap } from '../../src/assets/asset-map.js';
import { framer as generic } from '../../src/platforms/framer.js';
import { downloadAll } from '../../src/exporter/download.js';
import { dlResource } from '../../src/network/download.js';
import { CFG } from '../../src/config/index.js';
import type { ExporterContext } from '../../src/types.js';

test('downloads complete recursive CSS dependencies with redirects, compression, cycles and query variants', async (t) => {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url!);
    if (req.url === '/entry') {
      res.writeHead(302, { location: '/styles/main.css' }).end();
      return;
    }
    if (req.url === '/styles/main.css') {
      res.writeHead(200, { 'content-type': 'text/css', 'content-encoding': 'gzip' });
      res.end(
        gzipSync(
          '@import "nested/extra.css"; @media(max-width:600px){.hero{background:url(../image.svg?w=600)}}'
        )
      );
    } else if (req.url === '/styles/nested/extra.css') {
      res
        .writeHead(200, { 'content-type': 'text/css' })
        .end(
          '@import "../main.css"; @font-face{src:url(../../font.woff2)}.small{background:url(../../image.svg?w=100#shape)}'
        );
    } else if (req.url?.startsWith('/image.svg')) {
      res.writeHead(200, { 'content-type': 'image/svg+xml' }).end('<svg>' + req.url + '</svg>');
    } else if (req.url === '/font.woff2') {
      res.writeHead(200, { 'content-type': 'font/woff2' }).end('font bytes');
    } else res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fe-css-download-'));
  t.after(() => fs.rm(outDir, { recursive: true, force: true }));
  const assets = new AssetMap();
  assets.localPathFor(base + '/entry', generic, 'text/css');
  const ctx = { siteUrl: base, outDir, assets, platform: generic } as ExporterContext;
  await downloadAll(ctx);
  for (const url of [
    '/entry',
    '/styles/main.css',
    '/styles/nested/extra.css',
    '/image.svg?w=600',
    '/image.svg?w=100',
    '/font.woff2',
  ]) {
    assert.ok(assets.entries.has(base + url), 'missing ' + url);
    await fs.access(path.join(outDir, assets.entries.get(base + url)!.localPath));
  }
  assert.equal(hits.filter((hit) => hit === '/styles/nested/extra.css').length, 1);
  assert.notEqual(
    assets.entries.get(base + '/image.svg?w=600')!.localPath,
    assets.entries.get(base + '/image.svg?w=100')!.localPath
  );
  const css = await fs.readFile(
    path.join(outDir, assets.entries.get(base + '/entry')!.localPath),
    'utf-8'
  );
  assert.ok(css.includes(base + '/styles/nested/extra.css'));
  assert.equal(assets.failures.size, 0);
});

test('bounds redirect loops and does not duplicate retries on request timeouts', async (t) => {
  let hangs = 0;
  const server = http.createServer((req, res) => {
    if (req.url === '/loop') res.writeHead(302, { location: '/loop' }).end();
    else hangs++;
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  await assert.rejects(dlResource(base + '/loop', 1), /Too many asset redirects/);
  const previousTimeout = CFG.dlTimeout;
  CFG.dlTimeout = 30;
  try {
    await assert.rejects(dlResource(base + '/hang', 2), /timeout/);
    assert.equal(hangs, 2);
  } finally {
    CFG.dlTimeout = previousTimeout;
  }
});

test('reports failed assets and leaves no nonexistent local mapping', async (t) => {
  const server = http.createServer((_req, res) => res.writeHead(404).end('missing'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const url = 'http://127.0.0.1:' + (server.address() as { port: number }).port + '/missing.css';
  const assets = new AssetMap();
  assets.localPathFor(url);
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fe-css-failed-'));
  t.after(() => fs.rm(outDir, { recursive: true, force: true }));
  await downloadAll({ assets, outDir, platform: generic, siteUrl: url } as ExporterContext);
  assert.equal(assets.entries.has(url), false);
  assert.equal(assets.failures.get(url), 'HTTP 404');
});
