import assert from 'node:assert/strict';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { captureResponsiveStyles } from '../../src/exporter/responsive-snapshot.js';
import { capturePageHtml } from '../../src/exporter/snapshot.js';
import { bubble } from '../../src/platforms/builder/bubble.js';
import { notion } from '../../src/platforms/cms/notion.js';
import type { ExporterContext } from '../../src/types.js';

test('frozen Bubble inline styles preserve measured responsive breakpoints and native CSS defaults', async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const source = await browser.newPage();
    await source.setViewport({ width: 1440, height: 900 });
    await source.setContent(
      '<html><head><style>.card{padding:40px 50px;background:rgb(30,40,50);color:white;width:70vw}</style></head>' +
        '<body><main class="bubble-element Page"><div class="card">Content</div></main><script>' +
        'function update(){document.querySelector(".card").style.cssText=innerWidth<800?"padding:40px 24px;":"";}update();addEventListener("resize",update);' +
        '</script></body></html>'
    );
    const fragment = await captureResponsiveStyles(source);
    assert.match(fragment, /max-width: 799px/);
    assert.match(fragment, /min-width: 800px/);
    const captured = (await capturePageHtml(source)).replace('</body>', fragment + '</body>');
    const html = bubble.postCapture!(captured, {} as ExporterContext);
    assert.doesNotMatch(html, /function update/);
    assert.match(html, /data-export-responsive-runtime/);
    const replay = await browser.newPage();
    await replay.setContent(html);
    for (const width of [1440, 1024, 800, 799, 768, 390, 320, 1440]) {
      await source.setViewport({ width, height: 900 });
      await source.bringToFront();
      await source.waitForFunction(
        () =>
          document.querySelector<HTMLElement>('.card')!.style.padding ===
          (innerWidth < 800 ? '40px 24px' : ''),
        { timeout: 3000 }
      );
      await replay.setViewport({ width, height: 900 });
      await replay.bringToFront();
      await replay.waitForFunction(
        () =>
          document.querySelector<HTMLElement>('.card')!.style.padding ===
          (innerWidth < 800 ? '40px 24px' : ''),
        { timeout: 3000 }
      );
      const sourceStyle = await source.evaluate(
        `JSON.stringify({padding:getComputedStyle(document.querySelector('.card')).padding,width:getComputedStyle(document.querySelector('.card')).width})`
      );
      const replayStyle = await replay.evaluate(
        `JSON.stringify({padding:getComputedStyle(document.querySelector('.card')).padding,width:getComputedStyle(document.querySelector('.card')).width})`
      );
      assert.equal(replayStyle, sourceStyle, 'width ' + width);
    }
  } finally {
    await browser.close();
  }
});

test('frozen Notion image blocks retain sampled viewport limits and proportional image heights', async () => {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    assert.equal(notion.captureResponsiveStyles, true);
    const source = await browser.newPage();
    await source.setViewport({ width: 1440, height: 900 });

    await source.setContent(
      '<html><head><style>*{box-sizing:border-box}body{margin:0}.notion-page-content{display:flex;flex-direction:column;align-items:center}.notion-image-block{width:576px;padding:8px}.image{width:100%;background:royalblue}</style></head>' +
        '<body><nav><button class="home">Home</button><button class="search">Search</button><button class="next">Next</button></nav><main class="notion-page-content"><div class="notion-image-block"><div class="image"><img class="rendition" width="32" height="16">Content</div></div></main><script>' +
        'function update(){document.querySelector(".notion-image-block").style.maxWidth=innerWidth+"px";document.querySelector(".image").style.height=(Math.min(innerWidth,576)-16)/2+"px";var search=document.querySelector(".search");if(innerWidth<600){if(search)search.remove();}else if(!search){search=document.createElement("button");search.className="search";search.textContent="Search";document.querySelector("nav").insertBefore(search,document.querySelector(".next"));}var image=document.querySelector(".rendition");image.src="data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2232%22%20height=%2216%22%3E%3Crect%20width=%2232%22%20height=%2216%22%20fill=%22"+(innerWidth<600?"blue":"red")+"%22/%3E%3C/svg%3E";if(innerWidth<600){image.setAttribute("srcset",image.src+" 1x");image.setAttribute("sizes","32px");}else{image.removeAttribute("srcset");image.removeAttribute("sizes");}}update();addEventListener("resize",update);' +
        '</script></body></html>'
    );
    const fragment = await captureResponsiveStyles(source);
    const captured = (await capturePageHtml(source)).replace('</body>', fragment + '</body>');
    const html = notion.postCapture!(captured, {} as ExporterContext);
    assert.doesNotMatch(html, /function update/);
    assert.match(html, /data-export-responsive-runtime/);
    const replay = await browser.newPage();
    await replay.setContent(html);
    for (const width of [1440, 390, 320, 480, 768, 1440]) {
      await source.setViewport({ width, height: 900 });
      await source.bringToFront();
      await source.waitForFunction(
        () =>
          document.querySelector<HTMLElement>('.notion-image-block')!.style.maxWidth ===
          innerWidth + 'px',
        { timeout: 3000 }
      );
      await replay.setViewport({ width, height: 900 });
      await replay.bringToFront();
      await replay.waitForFunction(
        () =>
          document.querySelector<HTMLElement>('.notion-image-block')!.style.maxWidth ===
          innerWidth + 'px',
        { timeout: 3000 }
      );
      const readGeometry = `JSON.stringify(Array.from(document.querySelectorAll('.notion-image-block,.image')).map(e=>({x:e.getBoundingClientRect().x,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})))`;
      assert.equal(
        await replay.evaluate(readGeometry),
        await source.evaluate(readGeometry),
        'width ' + width
      );
      const visibleControls = `Array.from(document.querySelectorAll('nav button')).filter(e=>getComputedStyle(e).display!=='none').map(e=>e.textContent)`;
      assert.deepEqual(
        await replay.evaluate(visibleControls),
        await source.evaluate(visibleControls),
        'controls at width ' + width
      );
      const imageAttributes = `['src','srcset','sizes'].map(name=>document.querySelector('.rendition').getAttribute(name))`;
      assert.deepEqual(
        await replay.evaluate(imageAttributes),
        await source.evaluate(imageAttributes),
        'image rendition at width ' + width
      );
    }
  } finally {
    await browser.close();
  }
});
