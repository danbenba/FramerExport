import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import puppeteer, { type Page } from 'puppeteer';
import { FramerExporter } from '../../src/exporter/index.js';

const colors: Record<string, number[]> = {
  red: [224, 48, 64, 255],
  blue: [48, 96, 224, 255],
  cyan: [32, 192, 208, 255],
};

function markup(subpage: boolean): string {
  const prefix = subpage ? '../images/' : './images/';
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><title>Frozen responsive image fixture</title><style>body{margin:20px;background:white;font:16px Arial}#rendition{display:block;width:160px;height:100px;margin:20px 0}</style></head><body><div id="notion-app"><main class="notion-page-content"><h1>Frozen image rendition</h1><p>The image changes its content at 600px without changing its geometry.</p><img id="rendition" width="160" height="100" src="${prefix}red.svg" alt="Responsive fixture"><a href="${subpage ? '/' : '/pages/second'}">${subpage ? 'Home' : 'Second page'}</a></main></div><script>
window.fixtureOriginalScript=true;
function updateImage(){const image=document.getElementById('rendition');if(innerWidth<=600){image.src='${prefix}blue.svg';image.srcset='${prefix}blue.svg 1x, ${prefix}cyan.svg 2x';image.sizes='160px';}else{image.removeAttribute('srcset');image.removeAttribute('sizes');image.src='${prefix}red.svg';}}
addEventListener('resize',updateImage);updateImage();
</script></body></html>`;
}

async function measurements(page: Page, rendition: string) {
  await page.waitForFunction(
    (expected) => {
      const image = document.getElementById('rendition') as HTMLImageElement;
      return image.complete && image.naturalWidth > 0 && image.currentSrc.includes(expected);
    },
    { timeout: 10000 },
    rendition
  );

  return page.evaluate(async () => {
    const image = document.getElementById('rendition') as HTMLImageElement;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0, 1, 1);
    const rectangle = image.getBoundingClientRect();
    return {
      rgba: [...context.getImageData(0, 0, 1, 1).data],
      width: rectangle.width,
      height: rectangle.height,
      src: image.getAttribute('src'),
      srcset: image.getAttribute('srcset'),
      sizes: image.getAttribute('sizes'),
      currentSrc: image.currentSrc,
      originalRuntime: 'fixtureOriginalScript' in window,
    };
  });
}

test(
  'frozen responsive images retain desktop/mobile content on root and nested pages with the source offline',
  { timeout: 120000 },
  async (t) => {
    const artifactRoot = path.resolve('tmp/beta4-validation');
    await fs.mkdir(artifactRoot, { recursive: true });
    const artifactDir = await fs.mkdtemp(path.join(artifactRoot, 'responsive-images-'));
    const requests: string[] = [];
    const source = http.createServer((req, res) => {
      requests.push(req.url!);
      if (req.url === '/' || req.url === '/pages/second') {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(markup(req.url !== '/'));
      } else {
        const color = /^\/images\/(red|blue|cyan)\.svg$/.exec(req.url || '')?.[1];
        if (!color) {
          res.writeHead(404).end();
          return;
        }
        res
          .writeHead(200, { 'Content-Type': 'image/svg+xml' })
          .end(
            `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="rgb(${colors[color].slice(0, 3).join(',')})"/></svg>`
          );
      }
    });
    await new Promise<void>((resolve) => source.listen(0, '127.0.0.1', resolve));
    t.after(() => {
      source.closeAllConnections();
      if (source.listening) source.close();
    });
    const sourceOrigin = 'http://127.0.0.1:' + (source.address() as { port: number }).port;
    const browser = await puppeteer.launch({ headless: true });
    t.after(() => browser.close());
    const references = new Map<string, Awaited<ReturnType<typeof measurements>>>();
    for (const width of [1440, 390]) {
      for (const route of ['/', '/pages/second']) {
        const page = await browser.newPage();
        await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
        await page.goto(sourceOrigin + route);
        const measured = await measurements(page, width === 1440 ? 'red.svg' : 'blue.svg');
        assert.deepEqual(measured.rgba, colors[width === 1440 ? 'red' : 'blue']);
        assert.equal(measured.originalRuntime, true);
        references.set(width + route, measured);
        await page.close();
      }
    }
    const outDir = path.join(artifactDir, 'export');
    const exporter = new FramerExporter(sourceOrigin, outDir, 'notion');
    exporter.platform = { ...exporter.platform, hydrationTimeout: 50 };
    exporter.interactive = false;
    exporter.prettyPrint = false;
    await exporter.run(true);
    assert.equal(exporter.subpages.size, 1);
    assert.ok(
      requests.includes('/images/cyan.svg'),
      'the unused 2x rendition must be collected from the inert responsive template'
    );
    await new Promise<void>((resolve) => {
      source.closeAllConnections();
      source.close(() => resolve());
    });
    const probe = http.createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const port = (probe.address() as { port: number }).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    const origin = 'http://127.0.0.1:' + port;
    const preview = spawn(process.execPath, [path.join(outDir, 'serve.js')], {
      env: { ...process.env, PORT: String(port) },
      stdio: 'ignore',
      windowsHide: true,
    });
    t.after(() => {
      preview.kill();
    });
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try {
        if ((await fetch(origin)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, 'generated preview must start');
    const report: unknown[] = [];
    const failures: string[] = [];
    const cancelledImageRequests: string[] = [];
    const errors: string[] = [];
    for (const [sourceRoute, outputRoute] of [
      ['/', '/'],
      ['/pages/second', '/subpages/pages_second.html'],
    ]) {
      const page = await browser.newPage();
      await page.setCacheEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== origin) {
          failures.push('external ' + request.url());
          void request.abort();
        } else void request.continue();
      });
      page.on('response', (response) => {
        if (response.status() >= 400) failures.push(response.status() + ' ' + response.url());
      });
      page.on('requestfailed', (request) => {
        if (
          request.resourceType() === 'image' &&
          request.failure()?.errorText === 'net::ERR_ABORTED'
        ) {
          cancelledImageRequests.push(request.url());
        } else failures.push((request.failure()?.errorText || 'failed') + ' ' + request.url());
      });
      page.on('pageerror', (error) => errors.push(String(error)));
      await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
      await page.goto(origin + outputRoute, { waitUntil: 'networkidle0' });
      for (const width of [1440, 390, 1440, 390]) {
        await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
        await page.waitForFunction(
          (expected) =>
            document.getElementById('rendition')?.getAttribute('src')?.includes(expected),
          {},
          width === 1440 ? 'red.svg' : 'blue.svg'
        );
        const actual = await measurements(page, width === 1440 ? 'red.svg' : 'blue.svg');
        const expected = references.get(width + sourceRoute)!;
        assert.deepEqual(
          actual.rgba,
          expected.rgba,
          'rendered image content must match the source rendition'
        );
        assert.equal(actual.width, expected.width);
        assert.equal(actual.height, expected.height);
        assert.equal(actual.sizes, expected.sizes);
        assert.equal(actual.originalRuntime, false, 'hosted source script must remain removed');
        assert.equal(actual.srcset === null, expected.srcset === null);
        assert.equal(new URL(actual.currentSrc).origin, origin);
        report.push({ route: outputRoute, viewport: width, ...actual });
      }
      await page.close();
    }
    assert.deepEqual(failures, []);
    assert.deepEqual(errors, []);
    await fs.writeFile(
      path.join(artifactDir, 'report.json'),
      JSON.stringify(
        {
          status: 'passed',
          sourceStopped: true,
          comparisons: report,
          failures,
          errors,
          cancelledImageRequests,
        },
        null,
        2
      )
    );
  }
);
