import puppeteer, { type Page, type HTTPResponse } from 'puppeteer';
import { CFG } from '../config/index.js';
import { log, success, info, warn } from '../logger/index.js';
import { detectByDom } from '../platforms/index.js';
import type { PlatformHandler } from '../platforms/types.js';
import { detectAntiBotPage, AntiBotError } from './anti-bot.js';
import { capturePageHtml, waitForFonts } from './snapshot.js';
import { captureResponsiveStyles } from './responsive-snapshot.js';
import type { ExporterContext } from '../types.js';
const pendingResponses = new WeakMap<Page, Set<Promise<void>>>();

async function navigateToDocument(page: Page, url: string): Promise<HTTPResponse | null> {
  const navigation: { response: HTTPResponse | null } = { response: null };
  const record = (response: HTTPResponse): void => {
    if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) {
      navigation.response = response;
    }
  };
  page.on('response', record);
  try {
    return await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: Math.min(CFG.timeout, 30000),
    });
  } catch (error) {
    const response = navigation.response;
    if (
      (error as Error).name !== 'TimeoutError' ||
      !response ||
      response.status() < 200 ||
      response.status() >= 300
    )
      throw error;

    log('Document navigation timed out after receiving HTML; checking rendered content');
    return response;
  } finally {
    page.off('response', record);
  }
}

async function drainResponses(page: Page): Promise<void> {
  const pending = pendingResponses.get(page);
  if (!pending) return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled([...pending]),
    new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        log('Response body timeout; remaining assets will use the downloader');
        resolve();
      }, 10000);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function waitForHydration(page: Page, platform: PlatformHandler): Promise<void> {
  if (!platform.needsHydrationCheck) {
    await new Promise<void>((resolve) => setTimeout(resolve, platform.hydrationTimeout));
    return;
  }
  const selector = platform.hydrationSelector || '#main';
  try {
    await page.waitForFunction(
      (sel, fallback) => {
        const root = document.querySelector(sel) || (fallback ? document.body : null);
        return !!root && (root.children.length > 0 || !!root.textContent?.trim());
      },
      { timeout: Math.max(1, platform.hydrationTimeout), polling: 200 },
      selector,
      !platform.hydrationSelector
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
    log('Hydration content found: ' + selector);
  } catch {
    if (platform.captureContentSelector) {
      throw new Error(
        platform.displayName + ' content did not render; refusing to export an empty loading shell'
      );
    }
    warn('Hydration timeout for ' + selector + '; continuing with the visible page');
  }
}

async function scrollPage(page: Page, platform: PlatformHandler): Promise<void> {
  const strategy = platform.scrollStrategy || 'standard';
  if (strategy === 'none') return;
  const passes = strategy === 'infinite' ? 3 : 1;
  for (let pass = 0; pass < passes; pass++) {
    await page.evaluate(
      async ({ step, delay }) => {
        const started = Date.now();
        let y = 0;
        while (Date.now() - started < 30000) {
          const max = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
          y += step;
          window.scrollTo({ top: y, behavior: 'instant' });
          await new Promise<void>((resolve) => setTimeout(resolve, delay));
          if (y >= max + 500) break;
        }
        window.scrollTo({ top: 0, behavior: 'instant' });
      },
      { step: CFG.scrollStep, delay: CFG.scrollDelay }
    );
    if (pass < passes - 1) await new Promise<void>((resolve) => setTimeout(resolve, 1000));
  }
}

async function waitForResources(page: Page): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 2000));
  try {
    await page.waitForNetworkIdle({ idleTime: 1500, timeout: 8000 });
  } catch {
    log('Network idle timeout reached (continuing anyway)');
  }
  log('Waiting for font layout and response bodies');
  await waitForFonts(page);
  await drainResponses(page);
  log('Resources settled');
}

async function assertCapturedContent(page: Page, platform: PlatformHandler): Promise<void> {
  if (!platform.captureContentSelector) return;
  const ready = await page.evaluate((selector) => {
    const content = document.querySelector<HTMLElement>(selector);
    return (
      !!content &&
      (!!content.innerText?.trim() || !!content.querySelector('img, svg, canvas, video'))
    );
  }, platform.captureContentSelector);
  if (!ready)
    throw new Error(
      platform.displayName + ' content did not render; refusing to export an empty loading shell'
    );
}

async function readDocumentHtml(response: HTTPResponse | null): Promise<string | undefined> {
  if (!response) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    response.text().catch(() => undefined),
    new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), 1500);
    }),
  ]).finally(() => clearTimeout(timer));
}
export async function applyStealth(
  page: Page,
  browser: import('puppeteer').Browser
): Promise<void> {
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
    protocolTimeout: 30000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
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
  let documentSequence = 0;
  let capturedDocument: { sequence: number; url: string; html: string } | undefined;
  const pending = new Set<Promise<void>>();
  pendingResponses.set(exporter.page, pending);
  exporter.page.on('response', (res) => {
    const url: string = res.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    if (res.request().method() !== 'GET' || res.status() < 200 || res.status() >= 300) return;
    try {
      const host: string = new URL(url).hostname;
      const stripDomains = [...CFG.sharedStripDomains, ...exporter.platform.stripDomains];
      if (stripDomains.some((d) => host === d || host.endsWith('.' + d))) {
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
    const isMainDocument =
      res.request().isNavigationRequest() && res.frame() === exporter.page?.mainFrame();
    const sequence = isMainDocument ? ++documentSequence : 0;
    if (isMainDocument && exporter.platform.captureRenderedDom) return;
    if (!isMainDocument)
      exporter.assets.localPathFor(url, exporter.platform, res.headers()['content-type']);
    const read = (async () => {
      try {
        const buffer = await res.buffer();
        if (!isMainDocument) exporter.assets.buffers.set(url, buffer);
        if (isMainDocument && sequence >= (capturedDocument?.sequence ?? 0)) {
          capturedDocument = { sequence, url, html: buffer.toString('utf8') };
        }
        intercepted++;
      } catch {}
    })();
    pending.add(read);
    void read.finally(() => pending.delete(read));
  });
  log('Network interception enabled');
  exporter.cooking?.update('Navigating to site...');
  info('Navigating to ' + exporter.siteUrl);
  let navigationResponse = await navigateToDocument(exporter.page, exporter.siteUrl);
  success('Document loaded; waiting for page content and resources');
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
  if (!exporter.platformOverride && domDetected && domDetected.name !== exporter.platform.name) {
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
        navigationResponse = await navigateToDocument(exporter.page, exporter.siteUrl);
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
  if (navigationResponse && navigationResponse.status() >= 400) {
    throw new Error('Source page returned HTTP ' + navigationResponse.status());
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
  await waitForHydration(exporter.page, exporter.platform);
  exporter.cooking?.update('Scrolling page...');
  await scrollPage(exporter.page, exporter.platform);
  exporter.cooking?.update('Waiting for lazy resources and fonts...');
  await waitForResources(exporter.page);
  await assertCapturedContent(exporter.page, exporter.platform);
  if (exporter.platform.captureResponsiveStyles)
    exporter.cooking?.update('Capturing responsive styles...');
  const responsive = exporter.platform.captureResponsiveStyles
    ? await captureResponsiveStyles(exporter.page)
    : '';
  await drainResponses(exporter.page);
  const finalUrl = exporter.page.url();
  if (/^https?:\/\//i.test(finalUrl)) exporter.siteUrl = finalUrl;
  try {
    const currentDocument = capturedDocument as
      | { sequence: number; url: string; html: string }
      | undefined;
    const source = exporter.platform.captureRenderedDom
      ? undefined
      : currentDocument?.url.split('#')[0] === finalUrl.split('#')[0]
        ? currentDocument.html
        : undefined;
    exporter.ssrHTML = await capturePageHtml(exporter.page, source);
    if (responsive)
      exporter.ssrHTML = exporter.ssrHTML.replace(/<\/body>/i, responsive + '\n</body>');
    log('Captured HTML and CSSOM (' + (exporter.ssrHTML.length / 1024).toFixed(1) + ' KB)');
  } catch (e) {
    if (exporter.platform.captureRenderedDom || !exporter.ssrHTML) throw e;
    warn('CSSOM capture failed (keeping SSR HTML): ' + (e as Error).message);
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
  platform: PlatformHandler
): Promise<string> {
  log('  Navigating to sub-page: ' + url);
  const response = await navigateToDocument(page, url);
  if (response && response.status() >= 400) {
    throw new Error('Sub-page returned HTTP ' + response.status());
  }
  const antiBot = await detectAntiBotPage(page);
  if (antiBot) throw new AntiBotError(antiBot, platform.displayName, url);
  if (platform.preCapture) await platform.preCapture(page);
  await waitForHydration(page, platform);
  await scrollPage(page, platform);
  await waitForResources(page);
  await assertCapturedContent(page, platform);
  const responsive = platform.captureResponsiveStyles ? await captureResponsiveStyles(page) : '';
  await drainResponses(page);
  const source = platform.captureRenderedDom ? undefined : await readDocumentHtml(response);
  let html = await capturePageHtml(page, source);
  if (responsive) html = html.replace(/<\/body>/i, responsive + '\n</body>');
  log('  Sub-page fetched: ' + (html.length / 1024).toFixed(1) + ' KB');
  return html;
}
