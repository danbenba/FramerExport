import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { launchAndCapture, closeBrowser, captureSubpage } from '../../src/exporter/capture.js';
import { FramerExporter } from '../../src/exporter/index.js';

test('capture honors override and final URL, filters unsuccessful/POST responses and prepares subpages', async () => {
  const server = http.createServer((request, response) => {
    const url = request.url || '/';
    if (url === '/') {
      response.writeHead(302, { Location: '/landing/' });
      response.end();
      return;
    }
    if (url === '/landing/missing.css') {
      response.writeHead(404);
      response.end('bad CSS');
      return;
    }
    if (url === '/landing/redirect.css') {
      response.writeHead(302, { Location: './real.css' });
      response.end();
      return;
    }
    if (url === '/landing/real.css' || url === '/post.css') {
      response.writeHead(200, { 'Content-Type': 'text/css' });
      response.end('body{color:green}');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(
      '<!doctype html><html data-wf-site="override-test"><head><style id="dynamic"></style>' +
        '<link rel="stylesheet" href="redirect.css"><link rel="stylesheet" href="missing.css"></head>' +
        '<body><div id="render-root"></div><div style="height:1000px">Page</div><script>' +
        'fetch("/post.css", {method:"POST"});' +
        'setTimeout(() => {document.getElementById("render-root").textContent="Hydrated"}, 1200);' +
        'window.addEventListener("scroll", () => {if (window.scrollY > 0) document.getElementById("dynamic").sheet.insertRule("body { background: blue; }")}, {once:true});' +
        '</script></body></html>'
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const exporter = new FramerExporter(origin, 'tmp/capture-test-unused', 'carrd');
  exporter.platform = { ...exporter.platform, hydrationTimeout: 0, scrollStrategy: 'none' };
  try {
    await launchAndCapture(exporter);
    assert.equal(exporter.platform.name, 'carrd');
    assert.equal(exporter.siteUrl, origin + '/landing/');
    assert.equal(exporter.assets.entries.has(origin + '/landing/'), false);
    assert.equal(exporter.assets.buffers.has(origin + '/landing/'), false);
    assert.equal(exporter.assets.buffers.has(origin + '/landing/missing.css'), false);
    assert.equal(exporter.assets.buffers.has(origin + '/landing/redirect.css'), false);
    assert.equal(exporter.assets.buffers.has(origin + '/post.css'), false);
    assert.equal(exporter.assets.buffers.has(origin + '/landing/real.css'), true);
    let prepared = false;
    const subpage = await captureSubpage(exporter.page!, origin + '/landing/subpage', {
      ...exporter.platform,
      hydrationTimeout: 4000,
      needsHydrationCheck: true,
      hydrationSelector: '#render-root',
      scrollStrategy: 'standard',
      captureRenderedDom: true,
      async preCapture() {
        prepared = true;
      },
    });
    assert.equal(prepared, true);
    assert.match(subpage, /Hydrated/);
    assert.match(subpage, /background: blue/);
  } finally {
    await closeBrowser(exporter);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('HTTP error pages fail capture instead of producing a successful export', async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(404, { 'Content-Type': 'text/html' });
    response.end('<html><body>Not found</body></html>');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const exporter = new FramerExporter(origin, 'tmp/capture-error-unused', 'carrd');
  try {
    await assert.rejects(launchAndCapture(exporter), /Source page returned HTTP 404/);
  } finally {
    await closeBrowser(exporter);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
