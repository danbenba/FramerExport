import puppeteer, { type Page } from 'puppeteer';
import { CFG } from '../config/index.js';
import { log, success, info } from '../logger/index.js';
import { detectByDom } from '../platforms/index.js';
import { detectAntiBotPage, AntiBotError } from './anti-bot.js';
import type { ExporterContext } from '../types.js';
async function applyStealth(page: Page, browser: import('puppeteer').Browser): Promise<void> {
  let chromeVersion = '131.0.0.0';
  try {
    const raw: string = await browser.version();
    const match = raw.match(/(?:Headless)?Chrome\/([\d.]+)/i);
    if (match) chromeVersion = match[1];
  } catch {}
  const major: string = chromeVersion.split('.')[0];
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/' +
      chromeVersion +
      ' Safari/537.36',
    {
      brands: [
        { brand: 'Chromium', version: major },
        { brand: 'Google Chrome', version: major },
        { brand: 'Not-A.Brand', version: '99' },
      ],
      fullVersion: chromeVersion,
      platform: 'Windows',
      platformVersion: '15.0.0',
      architecture: 'x86',
      model: '',
      mobile: false,
    }
  );
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
  await page.evaluateOnNewDocument(`
    Object.defineProperty(navigator, 'webdriver', { get: function() { return undefined; } });
    Object.defineProperty(navigator, 'languages', { get: function() { return ['en-US', 'en']; } });
    Object.defineProperty(navigator, 'plugins', {
      get: function() { return { length: 3, 0: {}, 1: {}, 2: {} }; }
    });
    if (!window.chrome) {
      window.chrome = { runtime: {}, loadTimes: function() {}, csi: function() {} };
    }
  `);
  log('Stealth hardening applied (Chrome ' + chromeVersion + ')');
}
export async function launchAndCapture(exporter: ExporterContext): Promise<void> {
  exporter.cooking?.update('Launching browser...');
  log('Launching headless Chromium...');
  exporter.browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });
  success('Chromium launched');
  exporter.page = await exporter.browser.newPage();
  await applyStealth(exporter.page, exporter.browser);
  const viewport = {
    ...CFG.viewport,
    deviceScaleFactor: exporter.deviceScaleFactor ?? CFG.viewport.deviceScaleFactor ?? 1,
  };
  await exporter.page.setViewport(viewport);
  log(
    'Viewport set to ' +
      viewport.width +
      'x' +
      viewport.height +
      ' at ' +
      viewport.deviceScaleFactor +
      'x DPR'
  );
  const allStripDomains: string[] = [...CFG.sharedStripDomains, ...exporter.platform.stripDomains];
  log('Blocking ' + allStripDomains.length + ' tracking domains:');
  for (const domain of allStripDomains) {
    log('  - ' + domain);
  }
  let intercepted = 0;
  let trackingBlocked = 0;
  let platformSkipped = 0;
  exporter.page.on('response', async (res) => {
    const url: string = res.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    try {
      const host: string = new URL(url).hostname;
      if (allStripDomains.some((d) => host.includes(d))) {
        trackingBlocked++;
        return;
      }
    } catch {
      return;
    }
    if (exporter.platform.skipAssetUrls?.some((re) => re.test(url))) {
      platformSkipped++;
      return;
    }
    exporter.assets.localPathFor(url, exporter.platform, res.headers()['content-type']);
    try {
      exporter.assets.buffers.set(url, await res.buffer());
      intercepted++;
    } catch {}
  });
  log('Network interception enabled');
  exporter.cooking?.update('Navigating to site...');
  info('Navigating to ' + exporter.siteUrl);
  await exporter.page.goto(exporter.siteUrl, {
    waitUntil: 'networkidle2',
    timeout: CFG.timeout,
  });
  success('Page loaded (networkidle2)');
  log(
    'Intercepted ' +
      intercepted +
      ' resources, blocked ' +
      trackingBlocked +
      ' tracking requests, skipped ' +
      platformSkipped +
      ' platform assets'
  );
  log('Checking DOM-based platform detection...');
  const domDetected = await detectByDom(exporter.page);
  if (domDetected && domDetected.name !== exporter.platform.name) {
    log(
      'Platform refined from DOM: ' +
        domDetected.displayName +
        ' (override: ' +
        exporter.platform.name +
        ')'
    );
    exporter.platform = domDetected;
  }
  let antiBot = await detectAntiBotPage(exporter.page);
  if (antiBot) {
    log('Anti-bot challenge detected (' + antiBot + '), waiting for it to clear...');
    exporter.cooking?.update('Waiting out anti-bot challenge...');
    await new Promise<void>((r) => setTimeout(r, 8000));
    antiBot = await detectAntiBotPage(exporter.page);
    if (antiBot) {
      try {
        await exporter.page.goto(exporter.siteUrl, {
          waitUntil: 'networkidle2',
          timeout: CFG.timeout,
        });
        await new Promise<void>((r) => setTimeout(r, 5000));
      } catch {}
      antiBot = await detectAntiBotPage(exporter.page);
    }
    if (!antiBot) {
      success('Anti-bot challenge cleared, continuing');
    }
  }
  if (antiBot) {
    throw new AntiBotError(antiBot, exporter.platform.displayName, exporter.siteUrl);
  }
  if (exporter.platform.preCapture) {
    try {
      exporter.cooking?.update('Preparing ' + exporter.platform.displayName + ' page...');
      await exporter.platform.preCapture(exporter.page);
      log('preCapture hook completed');
    } catch (e) {
      log('preCapture hook error (continuing): ' + (e as Error).message);
    }
  }
  exporter.cooking?.update('Waiting for ' + exporter.platform.displayName + ' hydration...');
  if (exporter.platform.needsHydrationCheck) {
    const sel: string = exporter.platform.hydrationSelector || '#main';
    log('Checking for ' + sel + ' element hydration...');
    log('Hydration timeout: ' + exporter.platform.hydrationTimeout + 'ms');
    const timeout = exporter.platform.hydrationTimeout;
    await exporter.page.evaluate(`
      new Promise(function(r) {
        var start = Date.now();
        var tick = function() {
          var m = document.querySelector(${JSON.stringify(sel)}) || document.body;
          if (m && m.children.length > 0) setTimeout(r, 2000);
          else if (Date.now() - start > ${timeout}) r();
          else setTimeout(tick, 200);
        };
        tick();
      })
    `);
    success('Hydration complete (SPA rendered)');
  } else {
    log('Static site detected, waiting ' + exporter.platform.hydrationTimeout + 'ms for render...');
    await new Promise<void>((r) => setTimeout(r, exporter.platform.hydrationTimeout));
    success(exporter.platform.displayName + ' page rendered');
  }
  const scrollStrategy = exporter.platform.scrollStrategy || 'standard';
  if (scrollStrategy === 'none') {
    log('Scroll skipped (scrollStrategy: none)');
  } else {
    exporter.cooking?.update('Scrolling page...');
    log(
      'Starting full-page scroll (step: ' + CFG.scrollStep + 'px, delay: ' + CFG.scrollDelay + 'ms)'
    );
    const scrollStep = CFG.scrollStep;
    const scrollDelay = CFG.scrollDelay;
    const pageHeight: number = (await exporter.page.evaluate(`
      Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
    `)) as number;
    log(
      'Page height: ' + pageHeight + 'px (' + Math.ceil(pageHeight / scrollStep) + ' scroll steps)'
    );
    const passes = scrollStrategy === 'infinite' ? 3 : 1;
    for (let pass = 0; pass < passes; pass++) {
      await exporter.page.evaluate(`
        new Promise(function(r) {
          var y = 0;
          var max = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
          var step = function() {
            y += ${scrollStep};
            window.scrollTo({ top: y, behavior: 'instant' });
            y < max + 500 ? setTimeout(step, ${scrollDelay}) : (window.scrollTo(0, 0), r());
          };
          step();
        })
      `);
      if (scrollStrategy === 'infinite' && pass < passes - 1) {
        await new Promise<void>((r) => setTimeout(r, 1000));
      }
    }
    success('Full-page scroll complete');
  }
  exporter.cooking?.update('Waiting for lazy resources...');
  log('Waiting 2s for lazy-loaded resources...');
  await new Promise<void>((r) => setTimeout(r, 2000));
  log('Checking network idle (1.5s quiet, 8s timeout)...');
  try {
    await exporter.page.waitForNetworkIdle({ idleTime: 1500, timeout: 8000 });
    success('Network idle confirmed');
  } catch {
    log('Network idle timeout reached (continuing anyway)');
  }
  if (exporter.platform.captureRenderedDom || !exporter.ssrHTML) {
    try {
      const rendered: string = await exporter.page.evaluate(
        () => '<!DOCTYPE html>\n' + document.documentElement.outerHTML
      );
      if (rendered && rendered.length > 200) {
        exporter.ssrHTML = rendered;
        log(
          'Captured rendered DOM as HTML source (' + (rendered.length / 1024).toFixed(1) + ' KB)'
        );
      }
    } catch (e) {
      log('Rendered DOM capture failed (keeping SSR HTML): ' + (e as Error).message);
    }
  }
  const totalCaptured: number = exporter.assets.buffers.size;
  success('Captured ' + totalCaptured + ' network resources total');
  const cssCount: number = [...exporter.assets.entries.values()].filter((e) =>
    e.localPath.endsWith('.css')
  ).length;
  const jsCount: number = [...exporter.assets.entries.values()].filter(
    (e) => e.localPath.endsWith('.js') || e.localPath.endsWith('.mjs')
  ).length;
  const imgCount: number = [...exporter.assets.entries.values()].filter((e) =>
    e.localPath.startsWith('assets/images')
  ).length;
  const fontCount: number = [...exporter.assets.entries.values()].filter((e) =>
    e.localPath.startsWith('assets/fonts')
  ).length;
  log(
    '  CSS: ' + cssCount + ' | JS: ' + jsCount + ' | Images: ' + imgCount + ' | Fonts: ' + fontCount
  );
}
export async function closeBrowser(exporter: {
  browser: import('puppeteer').Browser | null;
}): Promise<void> {
  if (exporter.browser) {
    await exporter.browser.close();
    exporter.browser = null;
    log('Browser closed');
  }
}
export async function captureSubpage(
  page: Page,
  url: string,
  platform: {
    needsHydrationCheck: boolean;
    hydrationTimeout: number;
  }
): Promise<string> {
  log('  Navigating to sub-page: ' + url);
  await page.goto(url, { waitUntil: 'networkidle2', timeout: CFG.timeout });
  if (platform.needsHydrationCheck) {
    await page.evaluate(`new Promise(function(r) {
        var t = Date.now();
        (function tick() {
          var m = document.getElementById('main') || document.body;
          if (m && m.children.length > 0) setTimeout(r, 500);
          else if (Date.now() - t > ${platform.hydrationTimeout}) r();
          else setTimeout(tick, 200);
        })();
      })`);
  } else {
    await new Promise<void>((r) => setTimeout(r, 1000));
  }
  const html: string = await page.evaluate(
    () => document.documentElement.outerHTML || document.body.innerHTML
  );
  log('  Sub-page fetched: ' + (html.length / 1024).toFixed(1) + ' KB');
  return html;
}
