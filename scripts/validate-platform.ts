import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import net from 'node:net';
import puppeteer, { type Browser } from 'puppeteer';
import { FramerExporter } from '../src/exporter/index.js';
import { getPlatformByName } from '../src/platforms/index.js';
import type { PlatformType } from '../src/platforms/types.js';
import { assessViewport, type ValidationPage } from './validation-result.js';
import { freezeAnimatedGifs } from './normalize-gifs.js';
import { applyStealth } from '../src/exporter/capture.js';

const args = process.argv.slice(2);
const freezeGifs = args.includes('--freeze-gifs');
const reuseExport = args.includes('--reuse-export');
const [platform, url, requestedOutput] = args.filter(
  (arg) => !['--freeze-gifs', '--reuse-export'].includes(arg)
);
if (!platform || !url)
  throw new Error(
    'Usage: node --import tsx scripts/validate-platform.ts <platform> <url> [output-dir] [--freeze-gifs] [--reuse-export]'
  );
const output = path.resolve(requestedOutput || `tmp/beta4-live/${platform}`);
await fs.mkdir(output, { recursive: true });
const report: Record<string, unknown> = {
  platform,
  url,
  capturedAt: new Date().toISOString(),
  viewports: [],
  status: 'running',
  threshold: 0.005,
  scope: 'This URL and these viewports only; hosted backend features are not validated.',
  normalization: freezeGifs
    ? 'Animated GIFs independently decoded to frame 0; original hashes and geometry recorded.'
    : 'None (GIF animation phases are not synchronized).',
  gifNormalizations: [],
  environment: {
    acceptLanguage: 'en-US,en;q=0.9',
    navigatorLanguages: ['en-US', 'en'],
    userAgent: 'Same browser-version Windows identity as capture.',
  },
};
const exporter = new FramerExporter(url, path.join(output, 'export'), platform as PlatformType);
exporter.interactive = false;
exporter.prettyPrint = false;
try {
  if (reuseExport) {
    const stat = await fs.stat(path.join(output, 'export', 'index.html'));
    report.reusedExport = {
      indexModifiedAt: stat.mtime.toISOString(),
      scope:
        'Existing export reused; this does not validate a new export or capture of the current source.',
    };
  } else await exporter.run(false);
} catch (error) {
  report.status = 'export-failed';
  report.error = (error as Error).message;
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  throw error;
}

const port = await new Promise<number>((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = probe.address() as net.AddressInfo;
    probe.close(() => resolve(address.port));
  });
});
const localOrigin = `http://127.0.0.1:${port}`;
const preview = spawn(process.execPath, [path.join(output, 'export', 'serve.js')], {
  env: { ...process.env, PORT: String(port) },
  stdio: 'ignore',
  windowsHide: true,
});
let browser: Browser | undefined;
try {
  browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });
  report.browser = await browser.version();
  let previewReady = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    if (preview.exitCode !== null) throw new Error('Preview server exited before validation');
    try {
      if ((await fetch(localOrigin)).ok) {
        previewReady = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!previewReady) throw new Error('Preview server did not become ready');
  let allPassed = true;
  const handler = getPlatformByName(platform as PlatformType);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const captures: Buffer[] = [];
    const fullCaptures: Buffer[] = [];
    const pages: ValidationPage[] = [];
    const normalizedHashes: string[][] = [];
    for (const [kind, target] of [
      ['source', url],
      ['export', localOrigin],
    ]) {
      const page = await browser.newPage();
      await page.setViewport({ ...viewport, deviceScaleFactor: 1 });
      await applyStealth(page, browser);
      const gifBuffers = new Map<string, Buffer>();
      const gifDownloads: Promise<void>[] = [];
      const gifErrors: string[] = [];
      const failed: string[] = [];
      const external: Array<{ type: string; url: string }> = [];
      const errors: string[] = [];
      const networkFailures: string[] = [];
      const readinessFailures: string[] = [];
      const readinessNotes: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('response', (response) => {
        if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
        if (freezeGifs && /image\/gif/i.test(response.headers()['content-type'] || '')) {
          gifDownloads.push(
            response
              .buffer()
              .then((buffer) => {
                gifBuffers.set(response.url(), buffer);
              })
              .catch((error) => {
                gifErrors.push(response.url() + ': ' + error.message);
              })
          );
        }
      });
      page.on('requestfailed', (request) =>
        networkFailures.push(`${request.failure()?.errorText || 'failed'} ${request.url()}`)
      );
      if (kind === 'export') {
        await page.setRequestInterception(true);
        page.on('request', (request) => {
          if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== localOrigin) {
            external.push({ type: request.resourceType(), url: request.url() });
            void request.abort();
          } else void request.continue();
        });
      }
      const response = await page.goto(target, { waitUntil: 'networkidle2', timeout: 90000 });

      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(handler.hydrationTimeout, 30000))
      );
      await page.evaluate(async () => {
        await Promise.race([
          document.fonts.ready,
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
      });
      await page.evaluate(async () => {
        const height = Math.min(document.documentElement.scrollHeight, 20000);
        for (let y = 0; y < height; y += 600) {
          window.scrollTo({ top: y, behavior: 'instant' });
          await new Promise((resolve) => setTimeout(resolve, 80));
        }
        window.scrollTo({ top: 0, behavior: 'instant' });
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 10000 }).catch(() => {
        readinessNotes.push(
          'Network did not settle within 10 seconds after scrolling; analytics or long polling can remain active.'
        );
      });
      const imageReadiness = await page.evaluate(async () => {
        const pending = Array.from(document.images).filter(
          (image) => image.currentSrc && (!image.complete || !image.naturalWidth)
        );
        let timer: ReturnType<typeof setTimeout> | undefined;
        const settled = await Promise.race([
          Promise.all(pending.map((image) => image.decode().catch(() => {}))).then(() => true),
          new Promise<boolean>((resolve) => {
            timer = setTimeout(() => resolve(false), 10000);
          }),
        ]);
        clearTimeout(timer);
        return { settled, pending: pending.map((image) => image.currentSrc) };
      });
      if (!imageReadiness.settled)
        readinessFailures.push(
          'Images did not finish decoding within 10 seconds: ' + imageReadiness.pending.join(', ')
        );
      for (const selector of handler.stripSelectors) {
        await page
          .$$eval(selector, (elements) => elements.forEach((element) => element.remove()))
          .catch(() => {});
      }
      await page.addStyleTag({
        content:
          '*,*::before,*::after{animation-play-state:paused!important;transition:none!important;caret-color:transparent!important}',
      });
      if (freezeGifs) {
        await Promise.all(gifDownloads);
        if (gifErrors.length) throw new Error('Could not read GIF bytes: ' + gifErrors.join('; '));
        const resources = await freezeAnimatedGifs(page, gifBuffers);
        (report.gifNormalizations as unknown[]).push({ viewport, kind, resources });
        normalizedHashes.push(
          [
            ...new Set(
              resources
                .filter((resource) => resource.placements.length)
                .map((resource) => resource.sha256)
            ),
          ].sort()
        );
      }
      await page.bringToFront();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
          })
      );
      const metrics = await page.evaluate(() => ({
        title: document.title,
        visibilityState: document.visibilityState,
        scrollY: window.scrollY,
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
        bodyTextLength: document.body.innerText.length,
        stylesheets: document.styleSheets.length,
        brokenImages: Array.from(document.images)
          .filter((image) => !!image.currentSrc && (!image.complete || image.naturalWidth === 0))
          .map((image) => image.currentSrc),
      }));

      const screenshot = Buffer.from(
        await page.screenshot({ path: path.join(output, `${viewport.width}-${kind}.png`) })
      );
      captures.push(screenshot);
      fullCaptures.push(
        Buffer.from(
          await page.screenshot({
            path: path.join(output, `${viewport.width}-${kind}-full.png`),
            fullPage: true,
          })
        )
      );
      pages.push({
        kind,
        status: response?.status(),
        metrics,
        failed,
        external,
        errors,
        networkFailures,
        readinessFailures,
        readinessNotes,
      });
      await page.close();
    }
    const compare = await browser.newPage();
    const compareImages = async (images: Buffer[]) =>
      compare.evaluate(
        async (dataUrls) => {
          const bitmaps = await Promise.all(
            dataUrls.map(async (value) => createImageBitmap(await (await fetch(value)).blob()))
          );
          const dimensions = bitmaps.map((bitmap) => ({
            width: bitmap.width,
            height: bitmap.height,
          }));
          if (bitmaps[0].width !== bitmaps[1].width || bitmaps[0].height !== bitmaps[1].height) {
            const totalPixels = Math.max(...bitmaps.map((bitmap) => bitmap.width * bitmap.height));
            return {
              differentPixels: totalPixels,
              totalPixels,
              ratio: 1,
              channelTolerance: 16,
              dimensions,
              dimensionMismatch: true,
            };
          }
          const pixels = bitmaps.map((bitmap) => {
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(bitmap, 0, 0);
            return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          });
          let different = 0;
          for (let i = 0; i < pixels[0].length; i += 4) {
            if (
              [0, 1, 2, 3].some(
                (channel) => Math.abs(pixels[0][i + channel] - pixels[1][i + channel]) > 16
              )
            )
              different++;
          }
          return {
            differentPixels: different,
            totalPixels: pixels[0].length / 4,
            ratio: different / (pixels[0].length / 4),
            channelTolerance: 16,
            dimensions,
            dimensionMismatch: false,
          };
        },
        images.map((buffer) => `data:image/png;base64,${buffer.toString('base64')}`)
      );
    const diff = await compareImages(captures);
    const fullPageDiff = await compareImages(fullCaptures);
    await compare.close();
    const assessment = assessViewport(diff.ratio, fullPageDiff.ratio, pages);
    if (freezeGifs && JSON.stringify(normalizedHashes[0]) !== JSON.stringify(normalizedHashes[1])) {
      assessment.passed = false;
      assessment.reasons.push('Animated GIF original byte hashes differ between source and export');
    }
    if (!assessment.passed) allPassed = false;
    (report.viewports as unknown[]).push({ viewport, diff, fullPageDiff, pages, ...assessment });
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(
      `VISUAL ${platform} ${viewport.width}: viewport ${(diff.ratio * 100).toFixed(3)}%, full-page ${(fullPageDiff.ratio * 100).toFixed(3)}% differ; ${assessment.passed ? 'PASS' : 'FAIL: ' + assessment.reasons.join('; ')}`
    );
  }
  report.status = allPassed ? 'passed' : 'failed';
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  if (!allPassed) process.exitCode = 1;
} catch (error) {
  report.status = 'validation-failed';
  report.error = (error as Error).message;
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  throw error;
} finally {
  await browser?.close();
  preview.kill();
}
