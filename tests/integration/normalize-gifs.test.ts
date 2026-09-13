import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import http from 'node:http';
import test from 'node:test';
import puppeteer from 'puppeteer';
import { freezeAnimatedGifs } from '../../scripts/normalize-gifs.js';

test('optional GIF measurement freezes the received first frame without changing layout or other images', async () => {
  const single = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
  const frame = Buffer.from('2c00000000010001000002024c0100', 'hex');
  const blackFrame = Buffer.from('2c0000000001000100000202440100', 'hex');
  const control = Buffer.from('21f904000a000000', 'hex');
  const animated = Buffer.concat([
    single.subarray(0, 19),
    control,
    frame,
    control,
    blackFrame,
    Buffer.from([0x3b]),
  ]);
  const server = http.createServer((req, res) => {
    if (req.url === '/animated.gif' || req.url === '/static.gif') {
      res
        .writeHead(200, { 'content-type': 'image/gif' })
        .end(req.url === '/animated.gif' ? animated : single);
    } else
      res.writeHead(200, { 'content-type': 'text/html' }).end(`<!doctype html><style>
      #background { width: 70px; height: 40px; background-image: linear-gradient(red,transparent),url('/animated.gif'); background-size:cover; }
      #background::before,#background::after { content:'';display:block;width:10px;height:10px;background-image:url('/animated.gif'); }
    </style><picture><source srcset='/animated.gif 1x'><img id='animated' src='/animated.gif' width='60' height='30'></picture><img id='static' src='/static.gif'><div id='background'></div>`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const received = new Map<string, Buffer>();
    const downloads: Promise<void>[] = [];
    page.on('response', (response) => {
      if (/image\/gif/.test(response.headers()['content-type'] || ''))
        downloads.push(
          response.buffer().then((buffer) => {
            received.set(response.url(), buffer);
          })
        );
    });
    await page.goto(origin, { waitUntil: 'networkidle0' });
    await Promise.all(downloads);
    const normalized = await freezeAnimatedGifs(page, received);
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0].frameCount, 2);
    assert.equal(normalized[0].sha256, createHash('sha256').update(animated).digest('hex'));
    assert.equal(normalized[0].width, 1);
    assert.equal(normalized[0].height, 1);
    assert.equal(normalized[0].placements.length, 4);
    for (const placement of normalized[0].placements)
      assert.deepEqual(placement.before, placement.after);
    const actual = await page.evaluate(() => {
      const img = document.querySelector<HTMLImageElement>('#animated')!;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!;
      context.drawImage(img, 0, 0);
      const background = document.querySelector('#background')!;
      return {
        image: img.currentSrc,
        static: document.querySelector<HTMLImageElement>('#static')!.currentSrc,
        pixel: Array.from(context.getImageData(0, 0, 1, 1).data),
        layers: getComputedStyle(background).backgroundImage,
        before: getComputedStyle(background, '::before').backgroundImage,
        after: getComputedStyle(background, '::after').backgroundImage,
      };
    });
    assert.match(actual.image, /^data:image\/png/);
    assert.equal(actual.static, origin + '/static.gif');
    assert.deepEqual(actual.pixel, [255, 255, 255, 255]);
    assert.match(actual.layers, /linear-gradient/);
    for (const value of [actual.layers, actual.before, actual.after])
      assert.match(value, /data:image\/png/);
  } finally {
    await browser.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
