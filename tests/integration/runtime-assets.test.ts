import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { AssetMap } from '../../src/assets/asset-map.js';
import { injectRuntimeAssets } from '../../src/exporter/runtime-assets.js';

test('runtime image, srcset and classic script assignments use captured files on root and subpages', async (t) => {
  const assets = new AssetMap();
  const image = assets.localPathFor('https://source.example/images/picture.svg?w=200')!;
  const script = assets.localPathFor('https://cdn.example/chunks/runtime.js')!;
  const markup = `<!doctype html><html><head><link rel="icon" href="data:,"></head><body><script>
    const image = new Image(); image.id='dynamic-image';
    image.src=['https:', '', 'source.example', 'images', 'picture.svg?w=200'].join('/'); document.body.appendChild(image);
    const responsive = new Image(); responsive.id='responsive-image';
    responsive.setAttribute('SRCSET', 'data:image/svg+xml,%3Csvg/%3E 1x, ' + ['https:', '', 'source.example', 'images', 'picture.svg?w=200'].join('/') + ' 2x'); document.body.appendChild(responsive);
    const runtime = document.createElement('script'); runtime.src=['https:', '', 'cdn.example', 'chunks', 'runtime.js'].join('/'); document.head.appendChild(runtime);
    const unknown = new Image(); unknown.src='https://unknown.example/picture.svg'; window.unknown=unknown.getAttribute('src');
    const anchor=document.createElement('a'); anchor.setAttribute('href','https://source.example/images/picture.svg?w=200'); window.anchor=anchor.getAttribute('href');
  </script></body></html>`;
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/subpages/post.html')
      res
        .writeHead(200, { 'Content-Type': 'text/html' })
        .end(
          injectRuntimeAssets(
            markup,
            assets,
            'https://source.example/blog/post',
            req.url === '/' ? '' : 'subpages'
          )
        );
    else if (req.url === '/' + image)
      res
        .writeHead(200, { 'Content-Type': 'image/svg+xml' })
        .end(
          '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/></svg>'
        );
    else if (req.url === '/' + script)
      res.writeHead(200, { 'Content-Type': 'text/javascript' }).end('window.runtimeLoaded=true;');
    else res.writeHead(404).end();
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
  await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 2 });
  await page.setRequestInterception(true);
  const external: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith(origin)) {
      external.push(request.url());
      void request.abort();
    } else void request.continue();
  });
  page.on('pageerror', (error) => errors.push(error.message));
  for (const route of ['/', '/subpages/post.html']) {
    await page.goto(origin + route, { waitUntil: 'networkidle0' });
    const actual = await page.evaluate(
      `({loaded:window.runtimeLoaded,image:document.getElementById('dynamic-image').naturalWidth,responsive:document.getElementById('responsive-image').naturalWidth,srcset:document.getElementById('responsive-image').getAttribute('srcset'),unknown:window.unknown,anchor:window.anchor})`
    );
    assert.equal(actual.loaded, true);
    assert.equal(actual.image, 32);
    assert.equal(actual.responsive, 16);
    assert.match(actual.srcset, /^data:image\/svg\+xml,%3Csvg\/%3E 1x,/);
    assert.equal(actual.unknown, 'https://unknown.example/picture.svg');
    assert.equal(actual.anchor, 'https://source.example/images/picture.svg?w=200');
  }

  assert.deepEqual(external, [
    'https://unknown.example/picture.svg',
    'https://unknown.example/picture.svg',
  ]);
  assert.deepEqual(errors, []);
});
