import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { captureSubpage } from '../../src/exporter/capture.js';
import { notion } from '../../src/platforms/cms/notion.js';
import { CFG } from '../../src/config/index.js';

test('streaming navigation captures actual content while empty Notion loading shells fail', async () => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    if (request.url === '/stream') {
      response.write(
        '<!doctype html><html><head></head><body><main class="notion-page-content">Streamed page content</main>'
      );
    } else
      response.end(
        '<!doctype html><html><head></head><body><div id="notion-app"><div id="skeleton">Loading</div></div></body></html>'
      );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 15000,
    args: ['--no-sandbox'],
  });
  const originalTimeout = CFG.timeout;
  CFG.timeout = 500;
  try {
    const page = await browser.newPage();
    const platform = { ...notion, hydrationTimeout: 500, scrollStrategy: 'none' as const };
    const html = await captureSubpage(page, origin + '/stream', platform);
    assert.match(html, /Streamed page content/);
    await assert.rejects(
      captureSubpage(page, origin + '/empty', platform),
      /refusing to export an empty loading shell/
    );
  } finally {
    CFG.timeout = originalTimeout;
    await browser.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
