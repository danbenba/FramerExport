import puppeteer from 'puppeteer';
import { CFG } from '../config/index.js';
import { log, success, info } from '../logger/index.js';
import type { ExporterContext } from '../types.js';

export async function launchAndCapture(exporter: ExporterContext): Promise<void> {
  exporter.cooking?.update('Launching browser...');
  log('Launching headless Chromium...');

  exporter.browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  success('Chromium launched');

  exporter.page = await exporter.browser.newPage();
  await exporter.page.setViewport(CFG.viewport);
  log('Viewport set to ' + CFG.viewport.width + 'x' + CFG.viewport.height);

  await exporter.page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  );
  log('User agent set to Chrome 131');

  const allStripDomains: string[] = [
    ...CFG.sharedStripDomains,
    ...exporter.platform.stripDomains,
  ];
  log('Blocking ' + allStripDomains.length + ' tracking domains:');
  for (const domain of allStripDomains) {
    log('  - ' + domain);
  }

  let intercepted = 0;
  let blocked = 0;

  exporter.page.on('response', async (res) => {
    const url: string = res.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;

    try {
      const host: string = new URL(url).hostname;
      if (allStripDomains.some((d) => host.includes(d))) {
        blocked++;
        return;
      }
    } catch {
      return;
    }

    exporter.assets.localPathFor(url, exporter.platform);
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
  log('Intercepted ' + intercepted + ' resources, blocked ' + blocked + ' tracking requests');

  exporter.cooking?.update('Waiting for ' + exporter.platform.displayName + ' hydration...');

  if (exporter.platform.needsHydrationCheck) {
    log('Checking for #main element hydration...');
    log('Hydration timeout: ' + exporter.platform.hydrationTimeout + 'ms');
    const timeout = exporter.platform.hydrationTimeout;
    await exporter.page.evaluate(`
      new Promise(function(r) {
        var start = Date.now();
        var tick = function() {
          var m = document.getElementById('main') || document.body;
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

  exporter.cooking?.update('Scrolling page...');
  log('Starting full-page scroll (step: ' + CFG.scrollStep + 'px, delay: ' + CFG.scrollDelay + 'ms)');

  const scrollStep = CFG.scrollStep;
  const scrollDelay = CFG.scrollDelay;

  const pageHeight: number = await exporter.page.evaluate(`
    Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
  `) as number;
  log('Page height: ' + pageHeight + 'px (' + Math.ceil(pageHeight / scrollStep) + ' scroll steps)');

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
  success('Full-page scroll complete');

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

  const totalCaptured: number = exporter.assets.buffers.size;
  success('Captured ' + totalCaptured + ' network resources total');

  const cssCount: number = [...exporter.assets.entries.values()].filter((e) => e.localPath.endsWith('.css')).length;
  const jsCount: number = [...exporter.assets.entries.values()].filter((e) => e.localPath.endsWith('.js') || e.localPath.endsWith('.mjs')).length;
  const imgCount: number = [...exporter.assets.entries.values()].filter((e) => e.localPath.startsWith('assets/images')).length;
  const fontCount: number = [...exporter.assets.entries.values()].filter((e) => e.localPath.startsWith('assets/fonts')).length;
  log('  CSS: ' + cssCount + ' | JS: ' + jsCount + ' | Images: ' + imgCount + ' | Fonts: ' + fontCount);

  await exporter.browser.close();
  exporter.browser = null;
  log('Browser closed');
}
