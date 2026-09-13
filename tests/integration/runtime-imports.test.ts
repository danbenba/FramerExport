import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { AssetMap } from '../../src/assets/asset-map.js';
import { injectRuntimeImports } from '../../src/exporter/runtime-imports.js';
import { rewriteModuleSpecifiers } from '../../src/exporter/html-rewrite.js';

test('native import maps localize constructed module URLs and preserve existing aliases and scopes', async (t) => {
  const assets = new AssetMap();
  const sources = new Map([
    ['https://framer.com/m/phosphor-icons/Star.js@0.0.57', 'export default "★"'],
    ['https://cdn.example/library.js', 'export default 7'],
    ['https://cdn.example/scoped/library.js', 'export default 12'],
    ['https://cdn.example/value.js', 'export const count=1'],
    ['https://cdn.example/scoped/value.js', 'export const count=4'],
    [
      'https://cdn.example/scoped/consumer.js',
      'import value from "library";import{count}from"./value.js";export{count}from"./value.js";export default value+count',
    ],
  ]);
  const localSources = new Map(
    [...sources].map(([url, source]) => [
      assets.localPathFor(url, undefined, 'text/javascript')!,
      source,
    ])
  );
  for (const [url, source] of sources) {
    localSources.set(
      assets.entries.get(url)!.localPath,
      rewriteModuleSpecifiers(source, url, 'scripts/vendor', assets)
    );
  }
  const markup = `<!doctype html><html><head><script type="importmap" id="original-map">{"imports":{"library":"https://cdn.example/library.js","pkg/":"https://cdn.example/"},"scopes":{"https://cdn.example/scoped/":{"library":"https://cdn.example/scoped/library.js"}}}</script>
    <script type="module">
      import library from 'library';
      import scoped, {count} from 'https://cdn.example/scoped/consumer.js';
      import prefixed from 'pkg/library.js';
      const prefix = 'https://framer.com/m/phosphor-icons/';
      const icon = await import(prefix + 'Star' + '.js@0.0.57');
      document.body.textContent = icon.default + ':' + library + ':' + scoped + ':' + prefixed + ':' + count;
    </script></head><body>Loading</body></html>`;
  const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/subpages/post.html')
      res
        .writeHead(200, { 'content-type': 'text/html' })
        .end(
          injectRuntimeImports(
            markup,
            assets,
            'https://source.example/blog/post',
            req.url === '/' ? '' : 'subpages'
          )
        );
    else if (localSources.has(req.url!.slice(1)))
      res
        .writeHead(200, { 'content-type': 'text/javascript' })
        .end(localSources.get(req.url!.slice(1)));
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
  const external: string[] = [];
  const errors: string[] = [];
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (!req.url().startsWith(origin)) {
      external.push(req.url());
      void req.abort();
    } else void req.continue();
  });
  page.on('pageerror', (error) => errors.push(error.message));
  for (const route of ['/', '/subpages/post.html']) {
    await page.goto(origin + route, { waitUntil: 'networkidle0' });
    assert.equal(await page.evaluate('document.body.textContent'), '★:7:16:7:4');
    assert.equal(
      await page.evaluate('document.querySelectorAll("script[type=importmap]").length'),
      1
    );
    assert.equal(
      await page.evaluate('document.getElementById("original-map").type'),
      'application/json'
    );
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
});
