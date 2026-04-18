import puppeteer from 'puppeteer';
import ora from 'ora';
import chalk from 'chalk';
import { CFG } from '../config/index.js';
import type { ExporterContext } from '../types.js';

export async function launchAndCapture(exporter: ExporterContext): Promise<void> {
  const spin = ora({ text: 'Launching browser...', color: 'cyan' }).start();
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

  spin.text = 'Loading page...';
  await exporter.page.goto(exporter.siteUrl, {
    waitUntil: 'networkidle2',
    timeout: CFG.timeout,
  });

  spin.text = `Waiting for ${exporter.platform.displayName} hydration...`;

  if (exporter.platform.needsHydrationCheck) {
    await exporter.page.evaluate(
      (timeout: number) =>
        new Promise<void>((r) => {
          const start: number = Date.now();
          const tick = (): void => {
            const m = document.getElementById('main') || document.body;
            if (m && m.children.length > 0) setTimeout(r, 2000);
            else if (Date.now() - start > timeout) r();
            else setTimeout(tick, 200);
          };
          tick();
        }),
      exporter.platform.hydrationTimeout
    );
  } else {
    await new Promise<void>((r) => setTimeout(r, exporter.platform.hydrationTimeout));
  }

  spin.stopAndPersist({
    symbol: chalk.green('[SUCCESS]'),
    text: `${exporter.platform.displayName} page loaded and hydrated`,
  });

  const scrollSpin = ora({
    text: 'Scrolling to trigger lazy loads...',
    color: 'magenta',
  }).start();
  await exporter.page.evaluate(
    (cfg: { scrollStep: number; scrollDelay: number }) =>
      new Promise<void>((r) => {
        let y = 0;
        const max: number = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        );
        const step = (): void => {
          y += cfg.scrollStep;
          window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior });
          y < max + 500 ? setTimeout(step, cfg.scrollDelay) : (window.scrollTo(0, 0), r());
        };
        step();
      }),
    { scrollStep: CFG.scrollStep, scrollDelay: CFG.scrollDelay }
  );

  await new Promise<void>((r) => setTimeout(r, 2000));

  try {
    await exporter.page.waitForNetworkIdle({ idleTime: 1500, timeout: 8000 });
  } catch {}

  scrollSpin.stopAndPersist({
    symbol: chalk.green('[SUCCESS]'),
    text: `Captured ${exporter.assets.buffers.size} network resources`,
  });
  await exporter.browser.close();
  exporter.browser = null;
}
