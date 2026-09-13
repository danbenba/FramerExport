import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { FramerExporter } from '../../src/exporter/index.js';

const ARTIFACT_ROOT = path.resolve('tmp/beta4-validation');
const FONT = new URL('../fixtures/fonts/Inter-Regular.latin.woff2', import.meta.url);
const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 1 },
];

function svg(fill: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100" viewBox="0 0 160 100"><rect width="160" height="100" fill="${fill}"/><path d="M20 70 60 30 90 60 120 20 150 70" fill="none" stroke="white" stroke-width="8"/></svg>`;
}

function fixtureHtml(subpage = false): string {
  const prefix = subpage ? '../' : './';
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Export fidelity fixture</title>
<link rel="icon" href="data:,">
<link rel="stylesheet" href="${prefix}css/main.css">
<link rel="stylesheet" href="${prefix}css/redirect.css">
<style id="runtime-css"></style>
<script src="${prefix}js/interaction.js" defer></script></head>
<body><main class="site-wrapper"><div class="site-main">
<header><span class="label">F-EXPORT TEST FIXTURE</span><a id="route-link" href="${subpage ? '/' : '/account/join'}">${subpage ? 'Home' : 'Create account'}</a></header>
<section class="card"><div class="copy"><span class="pill">${subpage ? 'Account details' : 'Responsive export'}</span><h1>${subpage ? 'Create your account' : 'Every detail travels.'}</h1>
<p>Fonts, nested stylesheets and responsive assets stay together when the original server goes offline.</p>
<div class="artwork"></div><img id="variant-image" src="${prefix}images/variant.svg?w=120" srcset="${prefix}images/variant.svg?w=120 120w, ${prefix}images/variant.svg?w=360 360w" sizes="(max-width: 600px) 120px, 360px" alt="Responsive example" width="160" height="100"></div>
<form id="signup"><h2>Try the signup flow</h2><p class="form-note">This local fixture creates no external account.</p>
<label>Email<input id="email" type="email" name="email" required autocomplete="off"></label>
<label>Password<input id="password" type="password" name="password" minlength="8" required autocomplete="off"></label>
<label class="check"><input id="terms" type="checkbox" required>Accept the fixture terms</label>
<button id="submit" type="submit">Create test account</button><output id="result" aria-live="polite"></output></form></section>
<footer class="dynamic-css">CSSOM and adopted stylesheet content</footer></div></main></body></html>`;
}

const MAIN_CSS = `@import "./nested/tokens.css";
@import url('./desktop/shared.css');
@import './mobile/shared.css' screen and (max-width: 600px);
@font-face{font-family:FixtureInter;src:url('../fonts/fixture.woff2') format('woff2');font-weight:100 900;font-display:block}
*{box-sizing:border-box}html,body{margin:0;padding:0;background:#f1f0ed;color:#202326;font-family:FixtureInter,Arial,sans-serif}body{padding:40px 30px}
.site-wrapper{max-width:1120px;margin:auto}header{display:flex;justify-content:space-between;align-items:center;margin-bottom:28px}.label{font-size:12px;letter-spacing:2px}a{color:#34594f;font-size:14px}
.card{display:grid;grid-template-columns:1.2fr 1fr;gap:48px;background:white;border:1px solid #d9dcda;border-radius:24px;padding:44px}.pill{display:inline-block;font-size:12px;background:#edf6ee;padding:8px 12px;border-radius:20px}h1{font-size:46px;line-height:1.05;letter-spacing:-2px;max-width:440px;margin:22px 0}p{line-height:1.6;font-size:15px}h2{font-size:23px;letter-spacing:-.6px;margin:0 0 12px}.form-note{font-size:12px;color:#637067;margin-bottom:25px}
label{display:block;font-size:13px;margin:16px 0}input:not([type=checkbox]){width:100%;display:block;padding:12px;margin-top:7px;border:1px solid #bfc8c2;border-radius:7px;font:inherit}.check{display:flex;gap:8px;align-items:center;font-size:12px}button{font:inherit;width:100%;padding:13px;border:0;border-radius:8px;background:#234d3e;color:white;cursor:pointer}output{display:block;font-size:13px;margin-top:15px}.artwork{height:100px;background-repeat:no-repeat;background-size:160px 100px;margin:18px 0}#variant-image{display:block}.dynamic-css{padding:25px 0;font-size:12px}
@media(max-width:600px){body{padding:22px 16px}.card{display:block;padding:24px;border-radius:16px}h1{font-size:36px}form{margin-top:32px}header{gap:12px}.label{font-size:10px;letter-spacing:1px}.artwork{background-image:url('../images/mobile-only.svg')}#variant-image{width:120px;height:75px}}`;

const INTERACTION_JS = `(() => {
  const style = document.getElementById('runtime-css');
  if (!style.sheet.cssRules.length) {
    style.sheet.insertRule('.dynamic-css { color: rgb(61, 90, 114); border-top: 3px solid rgb(193, 207, 216); }');
  }
  const sheet = new CSSStyleSheet();
  sheet.replaceSync('.pill { outline: 1px solid rgb(146, 172, 155); }');
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  document.getElementById('signup').addEventListener('submit', (event) => {
    event.preventDefault();
    const email = document.getElementById('email').value;
    document.getElementById('result').textContent = 'Test account ready for ' + email;
  });
  document.documentElement.dataset.fixtureReady = 'true';
})();`;

async function startFixture(): Promise<{
  server: http.Server;
  origin: string;
  requests: string[];
}> {
  const font = await fs.readFile(FONT);
  const requests: string[] = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://fixture.local');
    requests.push(url.pathname + url.search);
    const files: Record<string, [string, string | Buffer]> = {
      '/': ['text/html; charset=utf-8', fixtureHtml()],
      '/account/join': ['text/html; charset=utf-8', fixtureHtml(true)],
      '/css/main.css': ['text/css', MAIN_CSS],
      '/css/nested/tokens.css': [
        'text/css',
        '@import "../../theme/palette.css";:root{color-scheme:light}',
      ],
      '/theme/palette.css': ['text/css', ':root{--fixture-color:#234d3e}'],
      '/css/desktop/shared.css': [
        'text/css',
        '.artwork{background-image:url("../../images/desktop.svg")}',
      ],
      '/css/mobile/shared.css': ['text/css', 'h1{color:#78394c}'],
      '/theme/v2/redirected.css': [
        'text/css',
        '.copy{border-bottom:4px solid transparent;border-image:url("./border.svg") 1 stretch}',
      ],
      '/theme/v2/border.svg': ['image/svg+xml', svg('#234d3e')],
      '/images/desktop.svg': ['image/svg+xml', svg('#667b61')],
      '/images/mobile-only.svg': ['image/svg+xml', svg('#995772')],
      '/images/variant.svg': [
        'image/svg+xml',
        svg(url.searchParams.get('w') === '120' ? '#637998' : '#baa56d'),
      ],
      '/fonts/fixture.woff2': ['font/woff2', font],
      '/js/interaction.js': ['application/javascript', INTERACTION_JS],
    };
    if (url.pathname === '/css/redirect.css') {
      res.writeHead(302, { Location: '/theme/v2/redirected.css' });
      res.end();
      return;
    }
    const file = files[url.pathname];
    if (!file) {
      res.writeHead(404);
      res.end('Unknown fixture resource: ' + url.pathname);
      return;
    }
    res.writeHead(200, { 'Content-Type': file[0], 'Cache-Control': 'no-store' });
    res.end(file[1]);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address === 'object');
  return { server, origin: `http://127.0.0.1:${address.port}`, requests };
}

async function closeServer(server: http.Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
}

async function preview(outDir: string): Promise<{ child: ChildProcess; origin: string }> {
  const probe = http.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const address = probe.address();
  assert(address && typeof address === 'object');
  await closeServer(probe);
  const origin = `http://127.0.0.1:${address.port}`;
  const child = spawn(process.execPath, [path.join(outDir, 'serve.js')], {
    env: { ...process.env, PORT: String(address.port) },
    windowsHide: true,
    stdio: 'ignore',
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error('Generated serve.js exited: ' + child.exitCode);
    try {
      if ((await fetch(origin)).ok) return { child, origin };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error('Generated serve.js did not start');
}

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => document.documentElement.dataset.fixtureReady === 'true');
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.waitForNetworkIdle({ idleTime: 250, timeout: 10000 });
}

async function measurements(page: Page) {
  return page.evaluate(() => {
    const selectors = [
      '.card',
      'h1',
      '.pill',
      '.dynamic-css',
      '.artwork',
      '#variant-image',
      '#signup',
    ];
    return {
      fontLoaded: document.fonts.check('16px FixtureInter'),
      brokenImages: [...document.images].filter((img) => !img.complete || !img.naturalWidth).length,
      nodes: Object.fromEntries(
        selectors.map((selector) => {
          const node = document.querySelector(selector)!;
          const rect = node.getBoundingClientRect();
          const css = getComputedStyle(node);
          return [
            selector,
            {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              color: css.color,
              font: css.fontFamily,
              outline: css.outline,
              border: css.borderTopWidth,
            },
          ];
        })
      ),
    };
  });
}

async function pixelDiff(browser: Browser, before: Buffer, after: Buffer) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(
      async (sources) => {
        const images = await Promise.all(
          sources.map(
            (src) =>
              new Promise<HTMLImageElement>((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = src;
              })
          )
        );
        const [a, b] = images;
        if (a.width !== b.width || a.height !== b.height)
          return { changedPixels: -1, ratio: 1, width: b.width, height: b.height };
        const pixels = images.map((img) => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          return ctx.getImageData(0, 0, img.width, img.height).data;
        });
        let changedPixels = 0;
        for (let i = 0; i < pixels[0].length; i += 4) {
          if (
            [0, 1, 2, 3].some(
              (channel) => Math.abs(pixels[0][i + channel] - pixels[1][i + channel]) > 2
            )
          )
            changedPixels++;
        }
        return {
          changedPixels,
          ratio: changedPixels / (a.width * a.height),
          width: a.width,
          height: a.height,
        };
      },
      [before, after].map((buffer) => 'data:image/png;base64,' + buffer.toString('base64'))
    );
  } finally {
    await page.close();
  }
}

test(
  'full export preserves desktop/mobile pixels, CSS dependencies, routes and local signup interaction offline',
  { timeout: 180000 },
  async () => {
    await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
    const artifactDir = await fs.mkdtemp(path.join(ARTIFACT_ROOT, 'fixture-'));
    const outDir = path.join(artifactDir, 'export');
    const fixture = await startFixture();
    let fixtureOpen = true;
    let child: ChildProcess | undefined;
    let browser: Browser | undefined;
    const report: Record<string, unknown> = {
      source: 'local deterministic fixture; no external accounts created',
      implementation: process.env.EXPORT_VALIDATION_CLI || 'source',
      artifactDir,
      comparisons: [],
    };
    try {
      browser = await puppeteer.launch({ headless: true });
      const references = new Map<
        string,
        { screenshot: Buffer; metrics: Awaited<ReturnType<typeof measurements>> }
      >();
      for (const viewport of VIEWPORTS) {
        for (const route of ['/', '/account/join']) {
          const page = await browser.newPage();
          await page.setViewport(viewport);
          await page.goto(fixture.origin + route, { waitUntil: 'networkidle0' });
          await ready(page);
          const key = `${viewport.name}-${route === '/' ? 'home' : 'signup'}`;
          const screenshot = Buffer.from(await page.screenshot({ fullPage: true }));
          const metrics = await measurements(page);
          assert.equal(metrics.fontLoaded, true, 'source fixture font must load');
          assert.equal(metrics.brokenImages, 0, 'source fixture images must load');
          await fs.writeFile(path.join(artifactDir, key + '-source.png'), screenshot);
          references.set(key, { screenshot, metrics });
          await page.close();
        }
      }
      fixture.requests.length = 0;
      if (process.env.EXPORT_VALIDATION_CLI) {
        const cli = spawn(
          process.execPath,
          [
            path.resolve(process.env.EXPORT_VALIDATION_CLI),
            fixture.origin,
            outDir,
            '--platform',
            'carrd',
            '--subpages',
            '--no-update',
          ],
          {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
            timeout: 90000,
            env: { ...process.env, FEXPORT_HOME: path.join(artifactDir, 'preferences') },
          }
        );
        const output: Buffer[] = [];
        cli.stdout.on('data', (chunk: Buffer) => output.push(chunk));
        cli.stderr.on('data', (chunk: Buffer) => output.push(chunk));
        const [code, signal] = await once(cli, 'close');
        const log = Buffer.concat(output).toString();
        await fs.writeFile(path.join(artifactDir, 'packaged-cli.log'), log);
        assert.equal(code, 0, `Packaged CLI failed (${signal}): ${log}`);
        const exported = JSON.parse(
          await fs.readFile(path.join(outDir, 'export-report.json'), 'utf8')
        );
        assert.equal(exported.platform, 'carrd');
        assert.equal(exported.subpages, 1);
        assert.deepEqual(exported.failedAssets, []);
      } else {
        const exporter = new FramerExporter(fixture.origin, outDir, 'carrd');
        exporter.interactive = false;
        exporter.prettyPrint = false;
        await exporter.run(true);
        assert.equal(exporter.platform.name, 'carrd');
        assert.equal(exporter.subpages.size, 1);
      }
      assert(
        fixture.requests.includes('/images/mobile-only.svg'),
        'export must discover an asset used only at the uncaptured mobile breakpoint'
      );
      assert(
        fixture.requests.includes('/images/variant.svg?w=120'),
        'export must preserve small responsive variant'
      );
      assert(
        fixture.requests.includes('/images/variant.svg?w=360'),
        'export must preserve large responsive variant'
      );
      await closeServer(fixture.server);
      fixtureOpen = false;
      const server = await preview(outDir);
      child = server.child;
      const failures: string[] = [];
      const errors: string[] = [];
      for (const viewport of VIEWPORTS) {
        for (const route of ['/', '/subpages/account_join.html']) {
          const page = await browser.newPage();
          await page.setViewport(viewport);
          await page.setCacheEnabled(false);
          await page.setRequestInterception(true);
          page.on('request', (req) => {
            if (!req.url().startsWith(server.origin + '/') && !/^(data|blob):/.test(req.url())) {
              failures.push('external request: ' + req.url());
              void req.abort();
            } else {
              void req.continue();
            }
          });
          page.on('response', (res) => {
            if (res.status() >= 400) failures.push(`${res.status()}: ${res.url()}`);
          });
          page.on('pageerror', (error) => errors.push(String(error)));
          await page.goto(server.origin + route, { waitUntil: 'networkidle0' });
          await ready(page);
          const key = `${viewport.name}-${route === '/' ? 'home' : 'signup'}`;
          const expected = references.get(key)!;
          const screenshot = Buffer.from(await page.screenshot({ fullPage: true }));
          await fs.writeFile(path.join(artifactDir, key + '-export.png'), screenshot);
          const actualMetrics = await measurements(page);
          const diff = await pixelDiff(browser, expected.screenshot, screenshot);
          (report.comparisons as unknown[]).push({
            key,
            ...diff,
            metricsMatch: JSON.stringify(actualMetrics) === JSON.stringify(expected.metrics),
          });
          await fs.writeFile(
            path.join(artifactDir, 'report.json'),
            JSON.stringify(report, null, 2)
          );
          assert.deepEqual(
            actualMetrics,
            expected.metrics,
            key + ': exported geometry, CSS and loaded assets match source'
          );
          assert(
            diff.ratio <= 0.005,
            key +
              ': pixel difference must be below 0.5%, got ' +
              (diff.ratio * 100).toFixed(3) +
              '%'
          );
          await page.click('#submit');
          assert.equal(
            await page.$eval('#result', (node) => node.textContent),
            '',
            'empty signup must not submit'
          );
          await page.type('#email', 'fixture@example.test');
          await page.type('#password', 'fixture-password-123');
          await page.click('#terms');
          await page.click('#submit');
          assert.equal(
            await page.$eval('#result', (node) => node.textContent),
            'Test account ready for fixture@example.test'
          );
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle0' }),
            page.click('#route-link'),
          ]);
          assert.equal(
            new URL(page.url()).origin,
            server.origin,
            'internal navigation remains on exported origin'
          );
          assert.match(
            await page.$eval('h1', (node) => node.textContent || ''),
            route === '/' ? /Create your account/ : /Every detail travels/
          );
          await page.close();
        }
      }
      report.failures = failures;
      report.javascriptErrors = errors;
      assert.deepEqual(
        failures,
        [],
        'replay must have no external network dependency or missing local assets'
      );
      assert.deepEqual(errors, [], 'exported interaction scripts must run without errors');
      report.passed = true;
    } finally {
      await fs.writeFile(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));
      if (browser) await browser.close();
      child?.kill();
      if (fixtureOpen) await closeServer(fixture.server);
      console.log('Fidelity artifacts: ' + artifactDir);
    }
  }
);
