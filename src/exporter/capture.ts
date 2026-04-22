import puppeteer from 'puppeteer';
import chalk from 'chalk';
import { CFG } from '../config/index.js';
import { log } from '../logger/index.js';
import type { ExporterContext } from '../types.js';

export async function launchAndCapture(exporter: ExporterContext): Promise<void> {
  exporter.cooking?.update('Launching browser...');

  exporter.browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  exporter.page = await exporter.browser.newPage();
  await exporter.page.setViewport(CFG.viewport);
  await exporter.page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  );

  const allStripDomains: string[] = [
    ...CFG.sharedStripDomains,
    ...exporter.platform.stripDomains,
  ];

  exporter.page.on('response', async (res) => {
    const url: string = res.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;

    try {
      const host: string = new URL(url).hostname;
      if (allStripDomains.some((d) => host.includes(d))) return;
    } catch {
      return;
    }

    exporter.assets.localPathFor(url, exporter.platform);
    try {
      exporter.assets.buffers.set(url, await res.buffer());
    } catch {}
  });

  exporter.cooking?.update('Loading page...');
  await exporter.page.goto(exporter.siteUrl, {
    waitUntil: 'networkidle2',
    timeout: CFG.timeout,
  });

  exporter.cooking?.update(`Waiting for ${exporter.platform.displayName} hydration...`);

  if (exporter.platform.needsHydrationCheck) {
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
  } else {
    await new Promise<void>((r) => setTimeout(r, exporter.platform.hydrationTimeout));
  }

  log(`  ${chalk.green('✓')} ${exporter.platform.displayName} page loaded and hydrated`);

  exporter.cooking?.update('Scrolling to trigger lazy loads...');

  const scrollStep = CFG.scrollStep;
  const scrollDelay = CFG.scrollDelay;
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

  await new Promise<void>((r) => setTimeout(r, 2000));

  try {
    await exporter.page.waitForNetworkIdle({ idleTime: 1500, timeout: 8000 });
  } catch {}

  log(`  ${chalk.green('✓')} Captured ${exporter.assets.buffers.size} network resources`);
  await exporter.browser.close();
  exporter.browser = null;
}
