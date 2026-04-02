import puppeteer from 'puppeteer';
import ora from 'ora';
import chalk from 'chalk';
import { CFG } from '../config/index.js';

export async function launchAndCapture(exporter) {
  const spin = ora({ text: 'Launching browser...', color: 'cyan' }).start();
  exporter.browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  exporter.page = await exporter.browser.newPage();
  await exporter.page.setViewport(CFG.viewport);
  await exporter.page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  );

  exporter.page.on('response', async (res) => {
    const url = res.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;

    try {
      const host = new URL(url).hostname;
      if (CFG.stripDomains.some((d) => host.includes(d))) return;
    } catch {
      return;
    }

    exporter.assets.localPathFor(url);
    try {
      exporter.assets.buffers.set(url, await res.buffer());
    } catch {}
  });

  spin.text = 'Loading page...';
  await exporter.page.goto(exporter.siteUrl, {
    waitUntil: 'networkidle2',
    timeout: CFG.timeout,
  });

  spin.text = 'Waiting for hydration...';
  await exporter.page.evaluate(
    (wait) =>
      new Promise((r) => {
        const start = Date.now();
        const tick = () => {
          const m = document.getElementById('main') || document.body;
          const isFramer = !!document.getElementById('main');

          if (isFramer) {
            if (m && m.children.length > 0) setTimeout(r, wait);
            else if (Date.now() - start > 10000) r();
            else setTimeout(tick, 200);
          } else {
            setTimeout(r, 1000);
          }
        };
        tick();
      }),
    2000
  );
  spin.stopAndPersist({
    symbol: chalk.green('[SUCCESS]'),
    text: 'Page loaded and hydrated',
  });

  const scrollSpin = ora({
    text: 'Scrolling to trigger lazy loads...',
    color: 'magenta',
  }).start();
  await exporter.page.evaluate(
    (cfg) =>
      new Promise((r) => {
        let y = 0;
        const max = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
        );
        const step = () => {
          y += cfg.scrollStep;
          window.scrollTo({ top: y, behavior: 'instant' });
          y < max + 500 ? setTimeout(step, cfg.scrollDelay) : (window.scrollTo(0, 0), r());
        };
        step();
      }),
    { scrollStep: CFG.scrollStep, scrollDelay: CFG.scrollDelay }
  );

  await new Promise((r) => setTimeout(r, 2000));

  try {
    await exporter.page.waitForNetworkIdle({ idleTime: 1000, timeout: 5000 });
  } catch {}

  scrollSpin.stopAndPersist({
    symbol: chalk.green('[SUCCESS]'),
    text: `Captured ${exporter.assets.buffers.size} network resources`,
  });
  await exporter.browser.close();
  exporter.browser = null;
}
