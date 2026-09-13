import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { AssetMap } from '../../src/assets/asset-map.js';
import { injectRuntimeStyles } from '../../src/exporter/runtime-styles.js';

test('runtime font loaders built from URL pieces reuse captured CSS on root and subpages', async (t) => {
  const assets = new AssetMap();
  const google = assets.localPathFor(
    'https://fonts.googleapis.com/css?family=Sen:regular,700,800',
    undefined,
    'text/css'
  )!;
  const relative = assets.localPathFor(
    'https://source.example/blog/css/component.css',
    undefined,
    'text/css'
  )!;
  const script = `<script>
    const link = document.createElement('link'); link.rel = 'stylesheet';
    link.href = ['http:', '', 'fonts.googleapis.com', 'css'].join('/') + '?family=' + ['Sen:regular', '700', '800'].join(',');
    document.head.appendChild(link);
    const second = document.createElement('link'); second.rel = 'stylesheet';
    second.setAttribute('HREF', ['css', 'component.css'].join('/')); document.head.appendChild(second);
    const unknown = document.createElement('link'); unknown.href = 'https://external.example/uncaptured.css';
    window.untouched = unknown.getAttribute('href');
    const anchor = document.createElement('a'); anchor.setAttribute('href', 'https://external.example/image.png');
    window.anchorUntouched = anchor.getAttribute('href');
  </script>`;
  const makeHtml = (fromDir: string) =>
    injectRuntimeStyles(
      '<!doctype html><html><head>' +
        script +
        '</head><body><p class="text">Local font CSS</p></body></html>',
      assets,
      'https://source.example/blog/post',
      fromDir
    );
  const requested: string[] = [];
  const server = http.createServer((req, res) => {
    requested.push(req.url!);
    if (req.url === '/' || req.url === '/subpages/post.html') {
      res
        .writeHead(200, { 'content-type': 'text/html' })
        .end(makeHtml(req.url === '/' ? '' : 'subpages'));
    } else if (req.url === '/' + google) {
      res.writeHead(200, { 'content-type': 'text/css' }).end('.text{color:rgb(17,34,51)}');
    } else if (req.url === '/' + relative) {
      res.writeHead(200, { 'content-type': 'text/css' }).end('.text{font-size:31px}');
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
  await page.setRequestInterception(true);
  const external: string[] = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(origin)) {
      external.push(request.url());
      void request.abort();
    } else void request.continue();
  });
  for (const route of ['/', '/subpages/post.html']) {
    await page.goto(origin + route, { waitUntil: 'networkidle0' });
    const result = await page.evaluate(
      `({color:getComputedStyle(document.querySelector('.text')).color,size:getComputedStyle(document.querySelector('.text')).fontSize,untouched:window.untouched,anchor:window.anchorUntouched})`
    );
    assert.deepEqual(result, {
      color: 'rgb(17, 34, 51)',
      size: '31px',
      untouched: 'https://external.example/uncaptured.css',
      anchor: 'https://external.example/image.png',
    });
  }
  assert.deepEqual(external, []);
  assert.equal(requested.filter((url) => url === '/' + google).length, 2);
  assert.equal(requested.filter((url) => url === '/' + relative).length, 2);
});
