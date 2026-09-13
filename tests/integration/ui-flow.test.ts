import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import test from 'node:test';
import puppeteer, { type Page } from 'puppeteer';
import { startUiServer } from '../../src/ui/server.js';

async function fill(page: Page, selector: string, value: string): Promise<void> {
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type(selector, value);
}

async function activeScreen(page: Page): Promise<string> {
  return page.$eval('.screen.active', (node) => node.id);
}

async function capture(page: Page, options: Parameters<Page['screenshot']>[0]): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map((animation) => animation.finished.catch(() => {}))
    );
  });
  await page.screenshot(options);
}

async function expectHoverFeedback(page: Page, selector: string): Promise<void> {
  await page.mouse.move(0, 0);
  const before = await page.$eval(selector, (node) => {
    const style = getComputedStyle(node);
    return [style.backgroundColor, style.borderColor, style.color].join('|');
  });
  await page.hover(selector);
  await page.waitForFunction(
    (target, previous) => {
      const style = getComputedStyle(document.querySelector(target)!);
      return [style.backgroundColor, style.borderColor, style.color].join('|') !== previous;
    },
    {},
    selector,
    before
  );
  const after = await page.$eval(selector, (node) => {
    const style = getComputedStyle(node);
    return [style.backgroundColor, style.borderColor, style.color].join('|');
  });
  assert.notEqual(after, before, selector + ' must have visible hover feedback');
}

test(
  'browser wizard preserves its draft across steps, modes and reload, then completes a real export',
  { timeout: 120000 },
  async () => {
    const artifactRoot = path.resolve('tmp/beta4-validation');
    await fs.mkdir(artifactRoot, { recursive: true });
    const artifactDir = await fs.mkdtemp(path.join(artifactRoot, 'ui-'));
    const outDir = path.join(artifactDir, 'export');
    const server = http.createServer((req, res) => {
      if (req.url === '/theme.css') {
        res.writeHead(200, { 'Content-Type': 'text/css' });
        res.end('body{background:#fcf7f2;font:20px Arial;color:#214d3d}h1{margin:40px}');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        '<!doctype html><html><head><meta charset="UTF-8"><title>UI fixture</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/theme.css"></head><body><main class="site-wrapper"><div class="site-main"><h1>' +
          (req.url === '/about' ? 'About the fixture' : 'UI export fixture') +
          '</h1><a href="' +
          (req.url === '/about' ? '/' : '/about') +
          '">Visit another page</a></div></main></body></html>'
      );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address === 'object');
    const source = `http://127.0.0.1:${address.port}`;
    const ui = await startUiServer(0, {
      quiet: true,
      preferencesHome: path.join(artifactDir, 'preferences'),
    });
    const origin = `http://127.0.0.1:${ui.port}`;
    const browser = await puppeteer.launch({
      headless: true,
      ignoreDefaultArgs: ['--hide-scrollbars'],
    });
    await browser
      .defaultBrowserContext()
      .overridePermissions(origin, [
        'clipboard-read',
        'clipboard-write',
        'clipboard-sanitized-write',
      ]);
    const page = await browser.newPage();
    const errors: string[] = [];
    const externalUiRequests: string[] = [];
    const requests: Record<string, unknown>[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('request', (req) => {
      if (/^https?:/.test(req.url()) && !req.url().startsWith(origin + '/'))
        externalUiRequests.push(req.url());
      if (req.url() === origin + '/api/export' && req.method() === 'POST')
        requests.push(JSON.parse(req.postData()!));
    });
    try {
      await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
      await page.goto(origin, { waitUntil: 'networkidle0' });
      await page.waitForFunction(() => document.querySelectorAll('#gallery .card').length === 6);
      assert.equal(await activeScreen(page), 'screen-gallery');
      assert.equal(await page.$eval('.brand', (node) => node.textContent), 'framerexport');
      assert.equal(await page.$('footer'), null);
      assert.equal(await page.$eval('#status', (node) => (node as HTMLElement).hidden), true);
      assert.equal(
        await page.$eval('[data-step="0"] .step-number', (node) => node.textContent),
        '1'
      );
      await page.waitForFunction(
        () => !!document.getElementById('pixelBackground')?.dataset.renderer
      );
      const backgroundRenderer = await page.$eval(
        '#pixelBackground',
        (node) => (node as HTMLElement).dataset.renderer
      );
      if (backgroundRenderer === 'webgl2') {
        const initialPreferences = await (await fetch(origin + '/api/preferences')).json();
        await page.waitForFunction(
          (expected) => document.getElementById('pixelBackground')?.dataset.motion === expected,
          {},
          initialPreferences.reduceMotion ? 'paused' : 'running'
        );
      }
      assert.equal(
        await page.$eval('[data-step="3"]', (node) => (node as HTMLButtonElement).disabled),
        true
      );
      assert.match(await page.$eval('#pageLabel', (node) => node.textContent || ''), /Page 1 of 5/);
      await page.waitForFunction(() =>
        Array.from(document.querySelectorAll<HTMLImageElement>('#gallery img')).every(
          (image) => image.complete && image.naturalWidth > 0
        )
      );
      const catalog = await (await fetch(origin + '/api/platforms')).json();
      const betaCount = catalog.categories
        .flatMap((category: { platforms: Array<{ beta: boolean }> }) => category.platforms)
        .filter((platform: { beta: boolean }) => platform.beta).length;
      assert.equal(betaCount, 3);
      assert.equal(catalog.auto.name, 'auto');
      assert(catalog.auto.iconDataUri.startsWith('data:image/png;base64,'));
      await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 2 });
      assert.equal(
        await page.$$eval('#gallery img', (nodes) =>
          nodes.every(
            (node) => (node as HTMLImageElement).naturalWidth >= node.clientWidth * devicePixelRatio
          )
        ),
        true,
        'provider icons must have enough detail for a HiDPI display'
      );
      await expectHoverFeedback(page, '#settingsBtn');
      await expectHoverFeedback(page, '#helpBtn');
      await page.waitForSelector('#appTooltip:not([hidden])');
      assert.match(await page.$eval('#appTooltip', (node) => node.textContent || ''), /Help with/);
      await page.click('#helpBtn');
      assert.equal(await activeScreen(page), 'screen-gallery');
      assert.equal(
        await page.$eval('#helpDialog', (node) => (node as HTMLDialogElement).open),
        true
      );
      await page.keyboard.press('Escape');
      assert.equal(
        await page.$eval('#helpDialog', (node) => (node as HTMLDialogElement).open),
        false
      );
      await expectHoverFeedback(page, '[data-provider="auto"]');
      await expectHoverFeedback(page, '#gallery .provider:nth-child(2)');
      await expectHoverFeedback(page, '#viewList');
      await expectHoverFeedback(page, '#pageNext');
      await expectHoverFeedback(page, '#providerNext');
      assert.equal(
        await page.$eval('#gallery', (node) => getComputedStyle(node).overflowY),
        'visible'
      );
      await capture(page, {
        path: path.join(artifactDir, 'gallery-desktop.png'),
        fullPage: true,
      });
      await page.click('#pageNext');
      assert.match(await page.$eval('#pageLabel', (node) => node.textContent || ''), /Page 2 of 5/);
      await page.click('#pagePrev');
      assert.equal(
        await page.$eval('[data-provider="auto"]', (node) => node.getAttribute('aria-pressed')),
        'true'
      );
      await page.click('#viewList');
      assert.equal(await page.$$eval('#gallery .card', (nodes) => nodes.length), 8);
      assert.equal(
        await page.$eval(
          '#gallery',
          (node) =>
            getComputedStyle(node).overflowY === 'auto' && node.scrollHeight > node.clientHeight
        ),
        true,
        'list view must have its own scroll area'
      );
      await expectHoverFeedback(page, '#gallery .provider:nth-child(2)');
      await page.hover('#gallery');
      await page.mouse.wheel({ deltaY: 350 });
      await page.waitForFunction(() => document.getElementById('gallery')!.scrollTop > 0);
      assert.equal(
        await page.$eval('#providerScroll', (node) => (node as HTMLElement).hidden),
        false
      );
      await page.focus('#providerScroll');
      await page.keyboard.press('End');
      await page.waitForFunction(
        () => document.getElementById('providerScroll')?.getAttribute('aria-valuenow') === '100'
      );
      await page.keyboard.press('Home');
      await page.waitForFunction(
        () => document.getElementById('providerScroll')?.getAttribute('aria-valuenow') === '0'
      );
      assert.match(await page.$eval('#pageLabel', (node) => node.textContent || ''), /Page 1 of 4/);
      await page.click('#pageNext');
      assert.match(
        await page.$eval('#resultCount', (node) => node.textContent || ''),
        /9–16 of 26/
      );
      await page.click('#viewCards');
      assert.equal(
        await page.$eval('#providerScroll', (node) => (node as HTMLElement).hidden),
        true
      );

      await fill(page, '#searchInput', 'no-such-platform');
      assert.match(
        await page.$eval('#gallery', (node) => node.textContent || ''),
        /No providers found/
      );
      await fill(page, '#searchInput', 'carrd');
      assert.equal(await page.$$eval('#gallery .card', (nodes) => nodes.length), 1);
      await page.focus('#gallery .card');
      await page.keyboard.press('Space');
      assert.equal(await activeScreen(page), 'screen-gallery');
      assert.equal(await page.$eval('#selectedProvider', (node) => node.textContent), 'Carrd');
      await page.click('#providerNext');
      assert.equal(await activeScreen(page), 'screen-url');
      assert.equal(await page.$eval('#urlTool', (node) => node.textContent), 'Carrd');
      assert.equal(
        await page.$eval('#urlNext', (node) => node.getAttribute('aria-disabled')),
        'true'
      );
      await page.hover('#urlNext');
      await page.waitForSelector('#appTooltip:not([hidden])');
      assert.match(
        await page.$eval('#appTooltip', (node) => node.textContent || ''),
        /Enter a website URL/
      );

      for (const value of ['not a URL', 'javascript:alert(1)']) {
        await fill(page, '#urlInput', value);
        await page.click('#urlNext');
        assert.equal(
          await activeScreen(page),
          'screen-url',
          'invalid or non-HTTP URL must remain on the URL screen'
        );
        assert.equal(
          await page.$eval('#urlNext', (node) => node.getAttribute('aria-disabled')),
          'true'
        );
        assert.match(
          await page.$eval('#urlNext', (node) => (node as HTMLElement).dataset.tooltip || ''),
          /valid HTTP/
        );
      }
      await fill(page, '#urlInput', source);
      await page.keyboard.press('Enter');
      await page.waitForSelector('#screen-options.active');
      await page.waitForFunction(() =>
        (document.getElementById('outInput') as HTMLInputElement).value.startsWith('./carrd-')
      );
      await page.click('#optPretty');
      await page.click('#optSubpages');
      await page.select('#optConcurrency', '6');
      await capture(page, {
        path: path.join(artifactDir, 'options-desktop.png'),
        fullPage: true,
      });
      await page.click('#optionsNext');
      assert.equal(await activeScreen(page), 'screen-review');
      await page.click('.brand');
      assert.equal(
        await activeScreen(page),
        'screen-review',
        'the brand must preserve the active step'
      );
      assert.deepEqual(
        await page.$$eval('#stepper .step-number', (nodes) =>
          nodes.map((node) => node.textContent)
        ),
        ['✓', '✓', '✓', '4']
      );
      assert.match(
        await page.$eval('#reviewOptions', (node) => node.textContent || ''),
        /Original JavaScript formatting.*Include sub-pages.*6 parallel/
      );
      await page.click('[data-step="1"]');
      assert.equal(await activeScreen(page), 'screen-url');
      await fill(page, '#outInput', path.relative(process.cwd(), outDir));
      await fill(page, '#urlInput', 'invalid');
      assert.equal(
        await page.$eval('[data-step="3"]', (node) => (node as HTMLButtonElement).disabled),
        true,
        'invalid details must disable completed later steps'
      );
      await fill(page, '#urlInput', source);
      await page.click('[data-step="0"]');
      await fill(page, '#searchInput', 'webflow');
      await page.click('#gallery .card');
      await fill(page, '#searchInput', 'carrd');
      await page.click('#gallery .card');
      await page.click('[data-step="3"]');
      assert.equal(
        await page.$eval('#reviewOut', (node) => node.textContent),
        path.relative(process.cwd(), outDir)
      );
      assert.match(
        await page.$eval('#reviewOptions', (node) => node.textContent || ''),
        /Original JavaScript formatting.*Include sub-pages.*6 parallel/
      );
      await page.click('#settingsBtn');
      assert.equal(await activeScreen(page), 'screen-review');
      assert.equal(await page.$eval('#settingsClose', (node) => node.textContent), 'Close');
      await page.click('#settingsReset');
      assert.equal(
        await page.$eval('#resetDialog', (node) => (node as HTMLDialogElement).open),
        true
      );
      await page.click('#resetCancel');
      assert.equal(await page.$eval('#reviewProvider', (node) => node.textContent), 'Carrd');
      await page.click('#settingsClose');
      assert.equal(await activeScreen(page), 'screen-review');
      await page.click('#settingsBtn');
      await page.select('#settingProvider', 'webflow');
      await page.select('#settingView', 'list');
      if (await page.$eval('#settingMotion', (node) => (node as HTMLInputElement).checked))
        await page.click('#settingMotion');
      await page.click('#settingsForm button[type="submit"]');
      await page.waitForFunction(
        () => !(document.getElementById('settingsDialog') as HTMLDialogElement).open
      );
      assert.equal(
        await page.$eval('#reviewProvider', (node) => node.textContent),
        'Carrd',
        'changing defaults must preserve the active export'
      );
      if (backgroundRenderer === 'webgl2') {
        await page.waitForFunction(
          () => document.getElementById('pixelBackground')?.dataset.motion === 'running'
        );
        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
        await page.waitForFunction(
          () => document.getElementById('pixelBackground')?.dataset.motion === 'paused'
        );
        await page.emulateMediaFeatures([
          { name: 'prefers-reduced-motion', value: 'no-preference' },
        ]);
        await page.waitForFunction(
          () => document.getElementById('pixelBackground')?.dataset.motion === 'running'
        );
      }
      await page.waitForFunction(
        async () => (await (await fetch('/api/draft')).json()).draft?.step === 3
      );
      await page.reload({ waitUntil: 'networkidle0' });
      await page.waitForSelector('#screen-review.active');
      assert.equal(await page.$eval('#reviewProvider', (node) => node.textContent), 'Carrd');
      assert.equal(
        await page.$eval('#reviewOut', (node) => node.textContent),
        path.relative(process.cwd(), outDir)
      );
      assert.match(
        await page.$eval('#reviewOptions', (node) => node.textContent || ''),
        /Original JavaScript formatting.*Include sub-pages.*6 parallel/
      );
      await capture(page, { path: path.join(artifactDir, 'review-desktop.png'), fullPage: true });
      await page.click('#startBtn');
      await page.waitForSelector('#screen-export.active');
      await page.waitForFunction(() => document.querySelectorAll('#term .ln').length > 0);
      await page.waitForFunction(
        () => ['done', 'error'].includes(document.getElementById('statusText')?.textContent || ''),
        { timeout: 90000 }
      );
      const status = await page.$eval('#statusText', (node) => node.textContent);
      const logs = await page.$eval('#term', (node) => node.textContent || '');
      assert.equal(status, 'done', logs);
      assert.match(logs, /Export complete/);
      assert.match(
        await page.$eval('#sideWritten', (node) => node.textContent || ''),
        /1 sub-pages/
      );
      assert.match(await page.$eval('#sideSummary', (node) => node.textContent || ''), /styles\//);
      assert.equal(
        await page.$eval('#donebar', (node) => node.classList.contains('visible')),
        true
      );
      assert.equal(await page.$eval('#exportOutput', (node) => node.textContent), outDir);
      assert.deepEqual(requests, [
        {
          url: source,
          platform: 'carrd',
          outDir: path.relative(process.cwd(), outDir),
          subpages: true,
          prettyPrint: false,
          concurrency: 6,
        },
      ]);
      assert.match(await fs.readFile(path.join(outDir, 'index.html'), 'utf8'), /UI export fixture/);
      assert.match(
        await fs.readFile(path.join(outDir, 'subpages/about.html'), 'utf8'),
        /About the fixture/
      );
      await capture(page, {
        path: path.join(artifactDir, 'success-desktop.png'),
        fullPage: true,
      });

      const run = (await (await fetch(origin + '/api/status')).json()).run;
      assert.equal(run.outDir, outDir);
      const commandPath = run.serveCommand.match(/^cd\s+"([^"]+)"/);
      assert(commandPath, 'serve command should quote its output path');
      assert.equal(
        path.resolve(commandPath[1]),
        outDir,
        'copied command must resolve to the actual nested output directory'
      );
      await page.click('#viewLogs');
      assert.equal(
        await page.$eval('#logsDialog', (node) => (node as HTMLDialogElement).open),
        true
      );
      assert.equal(
        await page.$eval('#term .ln', (node) => (node as HTMLElement).dataset.line),
        '1'
      );
      await fill(page, '#logSearch', 'Export complete');
      assert(await page.$$eval('#term .ln:not([hidden])', (nodes) => nodes.length > 0));
      assert.equal(
        await page.$$eval('#term .ln:not([hidden])', (nodes) =>
          nodes.every((node) => node.textContent?.includes('Export complete'))
        ),
        true
      );
      await fill(page, '#logSearch', '');
      await page.select('#logLevel', 'error');
      assert.equal(
        await page.$$eval('#term .ln:not([hidden])', (nodes) =>
          nodes.every((node) => (node as HTMLElement).dataset.level === 'error')
        ),
        true
      );
      await page.select('#logLevel', 'success');
      assert(await page.$$eval('#term .ln:not([hidden])', (nodes) => nodes.length > 0));
      assert.equal(
        await page.$$eval('#term .ln:not([hidden])', (nodes) =>
          nodes.every((node) => (node as HTMLElement).dataset.level === 'success')
        ),
        true
      );
      await page.select('#logLevel', 'all');
      await capture(page, { path: path.join(artifactDir, 'logs-desktop.png'), fullPage: true });
      await page.click('#copyLogs');
      await page.waitForFunction(
        () => document.getElementById('toast')?.textContent === 'logs copied'
      );
      assert.match(
        await page.evaluate(() => navigator.clipboard.readText()),
        /Export complete/,
        'Copy logs must place the complete export log in the browser clipboard'
      );
      await page.click('#logsClose');
      await page.click('#copyServe');
      await page.waitForFunction(
        () => document.getElementById('toast')?.textContent === 'serve command copied'
      );
      assert.equal(
        await page.evaluate(() => navigator.clipboard.readText()),
        run.serveCommand,
        'Copy serve command must copy the actual output command'
      );
      await page.click('#newExport');
      assert.equal(await activeScreen(page), 'screen-gallery');
      assert.equal(
        await page.$eval('[aria-current="step"] .step-number', (node) => {
          const style = getComputedStyle(node);
          return style.color !== style.backgroundColor;
        }),
        true,
        'returning to a completed step must keep its active number readable'
      );
      assert.equal(await page.$eval('#statusText', (node) => node.textContent), '');
      await fill(page, '#searchInput', '');
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
      assert.equal(
        await page.$eval('#viewList', (node) => node.getAttribute('aria-pressed')),
        'true'
      );
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true,
        'mobile gallery must not overflow horizontally'
      );
      await capture(page, { path: path.join(artifactDir, 'gallery-mobile.png'), fullPage: true });
      await page.click('#viewCards');
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true
      );
      await capture(page, {
        path: path.join(artifactDir, 'gallery-mobile-cards.png'),
        fullPage: true,
      });
      await fill(page, '#searchInput', 'carrd');
      await page.click('#gallery .card');
      await page.click('#providerNext');
      assert.equal(
        await page.$eval('#outInput', (node) => (node as HTMLInputElement).value),
        path.relative(process.cwd(), outDir)
      );
      await fill(page, '#outInput', '../outside-fixture');
      await page.click('#urlNext');
      await page.click('#optionsNext');
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        true
      );
      await capture(page, { path: path.join(artifactDir, 'review-mobile.png'), fullPage: true });
      await page.click('#startBtn');
      await page.waitForFunction(
        () => document.getElementById('statusText')?.textContent === 'error'
      );
      assert.match(
        await page.$eval('#term', (node) => node.textContent || ''),
        /working directory/
      );
      assert.equal(
        await page.$eval('#donebar', (node) => node.classList.contains('visible')),
        true,
        'a rejected export must provide the New export recovery action'
      );
      await page.click('#newExport');
      assert.equal(await activeScreen(page), 'screen-gallery');
      await page.click('#settingsBtn');
      await capture(page, {
        path: path.join(artifactDir, 'settings-mobile.png'),
        fullPage: true,
      });
      await page.click('#settingsReset');
      await capture(page, { path: path.join(artifactDir, 'reset-mobile.png'), fullPage: true });
      await page.click('#resetConfirm');
      await page.waitForFunction(
        () => !(document.getElementById('resetDialog') as HTMLDialogElement).open
      );
      assert.equal(await activeScreen(page), 'screen-gallery');
      assert.equal(
        await page.$eval('#selectedProvider', (node) => node.textContent),
        'Auto-detect'
      );
      assert.equal(await page.$eval('#urlInput', (node) => (node as HTMLInputElement).value), '');
      assert.equal((await (await fetch(origin + '/api/draft')).json()).draft, null);
      const resetPreferences = await (await fetch(origin + '/api/preferences')).json();
      assert.equal(resetPreferences.defaultProvider, 'auto');
      assert.equal(resetPreferences.viewMode, 'cards');
      assert.equal(resetPreferences.onboardingCompleted, false);
      assert.match(await fs.readFile(path.join(outDir, 'index.html'), 'utf8'), /UI export fixture/);
      assert.deepEqual(errors, []);
      assert.deepEqual(
        externalUiRequests,
        [],
        'provider artwork and UI assets must load without external requests'
      );
      await fs.writeFile(
        path.join(artifactDir, 'report.json'),
        JSON.stringify(
          {
            passed: true,
            source: 'local fixture; no external account',
            requests,
            javascriptErrors: errors,
            externalUiRequests,
            outDir,
          },
          null,
          2
        )
      );
    } finally {
      await browser.close();
      await ui.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      console.log('UI browser artifacts: ' + artifactDir);
    }
  }
);
