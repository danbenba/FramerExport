import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { TerminalIconRenderer } from '../../src/cli/terminal-icons.js';
import { TerminalCanvas, paintTerminal } from '../../src/cli/terminal-screen.js';
import { providerPresentation } from '../../src/platforms/presentation.js';

test(
  'native terminal image protocols render the provider artwork, resize and erase cleanly in Chromium',
  { timeout: 60000 },
  async () => {
    await mkdir(path.resolve('tmp'), { recursive: true });
    const artifactDir = await mkdtemp(path.resolve('tmp/terminal-images-'));
    const browser = await puppeteer.launch({ headless: true });
    const report = [];
    try {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (/^(data:|blob:|about:)/.test(request.url())) void request.continue();
        else void request.abort();
      });
      await page.setViewport({ width: 1500, height: 950, deviceScaleFactor: 2 });
      await page.setContent(
        '<body style="margin:0;background:#0a0a0a"><div id="terminal"></div></body>'
      );
      await page.addStyleTag({ path: path.resolve('node_modules/@xterm/xterm/css/xterm.css') });
      await page.addScriptTag({ path: path.resolve('node_modules/@xterm/xterm/lib/xterm.js') });
      await page.addScriptTag({
        path: path.resolve('node_modules/@xterm/addon-image/lib/addon-image.js'),
      });
      for (const mode of ['sixel', 'iterm'] as const) {
        for (const fontSize of [14, 22]) {
          const measured = await page.evaluate(async (size) => {
            const scope = window as any;
            scope.term?.dispose();
            document.getElementById('terminal')!.innerHTML = '';
            const term = new scope.Terminal({
              cols: 80,
              rows: 24,
              fontFamily: 'Consolas, monospace',
              fontSize: size,
              allowProposedApi: true,
              scrollback: 0,
              theme: { background: '#0a0a0a', foreground: '#eeeeee' },
            });
            const addon = new scope.ImageAddon.ImageAddon({ showPlaceholder: false });
            term.loadAddon(addon);
            term.open(document.getElementById('terminal'));
            scope.term = term;
            scope.addon = addon;
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            );
            let response = '';
            const listener = term.onData((value: string) => {
              response += value;
            });
            await new Promise<void>((resolve) =>
              term.write('\x1b[c\x1b[16t\x1b[?1049h\x1b[?25l', resolve)
            );
            listener.dispose();
            return response;
          }, fontSize);
          assert.match(measured, /\x1b\[\?[0-9;]*;4(?:;[0-9]+)*c/);
          const dimensions = measured.match(/\x1b\[6;(\d+);(\d+)t/)!;
          assert.ok(dimensions);
          const renderer = new TerminalIconRenderer({
            mode,
            cellWidth: Number(dimensions[2]),
            cellHeight: Number(dimensions[1]),
          });
          const placements = (['framer', 'webflow', 'wordpress', 'gamma'] as const).map(
            (providerId, index) => ({
              providerId,
              x: 4 + index * 18,
              y: 4,
              columns: 8,
              rows: 4,
              background: '#141414',
            })
          );
          const canvas = new TerminalCanvas(80, 24);
          for (const placement of placements) {
            canvas.fill(placement.x, placement.y, placement.columns, placement.rows, {
              bg: placement.background,
            });
            canvas.text(placement.x, 10, providerPresentation(placement.providerId).name);
          }
          const frame = renderer.frame(placements, { columns: 80, rows: 24 });
          const ansi = frame.before + paintTerminal(canvas.lines()) + frame.after;
          const comparison = await page.evaluate(
            async ({ data, icons }) => {
              const scope = window as any;
              await new Promise<void>((resolve) => scope.term.write(data, resolve));
              await new Promise<void>((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
              );
              const results = [];
              for (const icon of icons) {
                const rendered = scope.addon.getImageAtBufferCell(icon.x, icon.y) as
                  | HTMLCanvasElement
                  | undefined;
                if (!rendered) throw new Error('Missing image at ' + icon.x + ',' + icon.y);
                const source = new Image();
                source.src = icon.uri;
                await source.decode();
                const actual = document.createElement('canvas');
                const expected = document.createElement('canvas');
                actual.width = expected.width = rendered.width;
                actual.height = expected.height = rendered.height;
                const actualContext = actual.getContext('2d')!;
                const expectedContext = expected.getContext('2d')!;
                actualContext.fillStyle = expectedContext.fillStyle = '#141414';
                actualContext.fillRect(0, 0, actual.width, actual.height);
                expectedContext.fillRect(0, 0, expected.width, expected.height);
                actualContext.drawImage(rendered, 0, 0);
                expectedContext.imageSmoothingQuality = 'high';
                expectedContext.drawImage(source, 0, 0, expected.width, expected.height);
                const a = actualContext.getImageData(0, 0, actual.width, actual.height).data;
                const b = expectedContext.getImageData(0, 0, expected.width, expected.height).data;
                let difference = 0;
                for (let index = 0; index < a.length; index++)
                  difference += Math.abs(a[index] - b[index]);
                results.push({
                  provider: icon.id,
                  width: rendered.width,
                  height: rendered.height,
                  meanChannelDifference: difference / a.length,
                  rightOverflow: !!scope.addon.getImageAtBufferCell(icon.x + icon.columns, icon.y),
                  bottomOverflow: !!scope.addon.getImageAtBufferCell(icon.x, icon.y + icon.rows),
                });
              }
              return {
                results,
                baseY: scope.term.buffer.active.baseY,
                outside: !!scope.addon.getImageAtBufferCell(0, 0),
              };
            },
            {
              data: ansi,
              icons: placements.map((placement) => ({
                ...placement,
                id: placement.providerId,
                uri: providerPresentation(placement.providerId).iconDataUri,
              })),
            }
          );
          assert.equal(comparison.baseY, 0);
          assert.equal(comparison.outside, false);
          for (const result of comparison.results) {
            assert.ok(result.width >= 40 && result.height >= 40);
            assert.equal(result.rightOverflow, false);
            assert.equal(result.bottomOverflow, false);
            assert.ok(
              result.meanChannelDifference < 4,
              mode + ' ' + result.provider + ': ' + result.meanChannelDifference
            );
          }
          await page.screenshot({ path: path.join(artifactDir, `${mode}-${fontSize}.png`) });
          const erased = renderer.frame([], { columns: 80, rows: 24 });
          const cleared = await page.evaluate(
            async (data) => {
              const scope = window as any;
              await new Promise<void>((resolve) => scope.term.write(data, resolve));
              return [4, 22, 40, 58].every((x) => !scope.addon.getImageAtBufferCell(x, 4));
            },
            erased.before + paintTerminal(new TerminalCanvas(80, 24).lines()) + erased.after
          );
          assert.equal(cleared, true);
          renderer.cleanup();
          report.push({ mode, fontSize, ...comparison });
        }
      }
      assert.deepEqual(errors, []);
      await writeFile(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));
    } finally {
      await browser.close();
    }
  }
);
