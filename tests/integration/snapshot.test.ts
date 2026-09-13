import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { capturePageHtml } from '../../src/exporter/snapshot.js';

let browser: Browser;
let page: Page;
before(async () => {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  page = await browser.newPage();
});
after(async () => {
  await browser?.close();
});

for (const mode of ['rendered', 'ssr'] as const) {
  test(`${mode}: CSSOM insertions, deletions, lazy styles and adopted sheets survive without mutating the source`, async () => {
    const source =
      '<!doctype html><html><head><style id="first">.box { color: red; }</style>' +
      '<style id="dynamic"></style><style id="last">.box { width: 123px; }</style>' +
      '</head><body><div id="app"><div class="box">Content</div></div></body></html>';
    await page.setContent(source);
    await page.evaluate(`(() => {
      window.savedSheet = document.getElementById('dynamic').sheet;
      window.savedSheet.insertRule('.box { background: rgb(20, 30, 40); }');
      document.getElementById('first').sheet.deleteRule(0);
      const lazy = document.createElement('style');
      lazy.id = 'lazy';
      lazy.textContent = '.box { width: 200px; }';
      document.getElementById('last').before(lazy);
      const bodyStyle = document.createElement('style');
      bodyStyle.textContent = '.box { height: 77px; }';
      document.body.append(bodyStyle);
      const adopted = new CSSStyleSheet();
      adopted.replaceSync('.box { height: 88px; } @media(max-width: 500px) { .box { width: 99px; } }');
      document.adoptedStyleSheets = [adopted];
    })()`);
    const html = await capturePageHtml(page, mode === 'ssr' ? source : undefined);
    assert.match(html, /background: rgb\(20, 30, 40\)/);
    assert.doesNotMatch(html, /color: red/);
    assert.match(html, /data-export-adopted-stylesheet/);
    assert.ok(html.indexOf('id="lazy"') < html.indexOf('id="last"'));
    assert.equal(await page.evaluate(`document.getElementById('dynamic').textContent`), '');
    assert.equal(
      await page.evaluate(`window.savedSheet === document.getElementById('dynamic').sheet`),
      true
    );
    const original = await page.evaluate(
      `JSON.stringify({ width: getComputedStyle(document.querySelector('.box')).width, height: getComputedStyle(document.querySelector('.box')).height, background: getComputedStyle(document.querySelector('.box')).backgroundColor })`
    );
    const replay = await browser.newPage();
    try {
      await replay.setContent(html);
      assert.equal(
        await replay.evaluate(
          `JSON.stringify({ width: getComputedStyle(document.querySelector('.box')).width, height: getComputedStyle(document.querySelector('.box')).height, background: getComputedStyle(document.querySelector('.box')).backgroundColor })`
        ),
        original
      );
      await replay.setViewport({ width: 400, height: 600 });
      assert.equal(
        await replay.evaluate(`getComputedStyle(document.querySelector('.box')).width`),
        '99px'
      );
    } finally {
      await replay.close();
    }
  });
}

test('SSR capture preserves app hydration markup and executable scripts', async () => {
  const source =
    '<!doctype html><html><head><style data-emotion="css"></style></head><body>' +
    '<div id="app">Initial server markup</div><script id="runtime">window.started = true;</script></body></html>';
  await page.setContent(source);
  await page.evaluate(
    `document.getElementById('app').textContent = 'Rendered app'; document.querySelector('style').sheet.insertRule('#app { color: blue; }');`
  );
  const html = await capturePageHtml(page, source);
  assert.match(html, /Initial server markup/);
  assert.doesNotMatch(html, /Rendered app/);
  assert.match(html, /window.started = true/);
  assert.match(html, /color: blue/);
});

test('captured CSS cannot terminate its style element and disabled sheets remain disabled', async () => {
  await page.setContent(
    '<html><head><style id="test"></style></head><body><div class="box">A</div></body></html>'
  );
  await page.evaluate(
    `document.getElementById('test').sheet.insertRule('.box::before { content: "</style><p id=invalid>"; }'); document.getElementById('test').sheet.disabled = true;`
  );
  const html = await capturePageHtml(page);
  assert.match(html, /media="not all"/);
  const replay = await browser.newPage();
  try {
    await replay.setContent(html);
    assert.equal(await replay.$('#invalid'), null);
  } finally {
    await replay.close();
  }
});
