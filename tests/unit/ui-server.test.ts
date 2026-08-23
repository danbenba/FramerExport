import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startUiServer, type UiServerHandle } from '../../src/ui/server.js';

let handle: UiServerHandle;
let base = '';

test.before(async () => {
  handle = await startUiServer(0);
  base = `http://localhost:${handle.port}`;
});

test.after(async () => {
  await handle.close();
});

test('serves the UI shell with gallery, options and export screens', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/html/);
  const html = await res.text();
  assert.ok(html.includes('screen-gallery'));
  assert.ok(html.includes('screen-url'));
  assert.ok(html.includes('screen-options'));
  assert.ok(html.includes('screen-export'));
  assert.ok(html.includes('pixel-blast.js'));
});

test('serves the client app and the PixelBlast background script', async () => {
  const app = await (await fetch(base + '/app.js')).text();
  assert.ok(app.includes('loadGallery'));
  assert.ok(app.includes('EventSource'));
  const pb = await (await fetch(base + '/pixel-blast.js')).text();
  assert.ok(pb.includes('__PB_FRAG__'));
  assert.ok(pb.includes('window.PixelBlast'));
});

test('lists all 25 platforms grouped into 6 categories with beta flags', async () => {
  const data = (await (await fetch(base + '/api/platforms')).json()) as {
    categories: Array<{
      id: string;
      label: string;
      platforms: Array<{ name: string; beta: boolean }>;
    }>;
  };
  assert.equal(data.categories.length, 6);
  const all = data.categories.flatMap((c) => c.platforms);
  assert.equal(all.length, 25);
  for (const cat of data.categories) {
    assert.ok(cat.label.length > 0);
    assert.ok(cat.platforms.length > 0);
  }
  const stable = all.filter((p) => !p.beta).map((p) => p.name);
  assert.deepEqual(stable.sort(), ['framer', 'webflow', 'wix']);
  assert.equal(all.filter((p) => p.beta).length, 22);
});

test('derives an output name from a URL with and without explicit platform', async () => {
  const auto = (await (
    await fetch(base + '/api/derive?url=' + encodeURIComponent('https://demo.framer.app'))
  ).json()) as { name: string };
  assert.match(auto.name, /^framer-demo-/);
  const forced = (await (
    await fetch(
      base + '/api/derive?url=' + encodeURIComponent('https://example.com') + '&platform=webflow'
    )
  ).json()) as { name: string };
  assert.match(forced.name, /^webflow-example-com-/);
});

test('reports idle status with a progress snapshot', async () => {
  const data = (await (await fetch(base + '/api/status')).json()) as {
    run: { state: string };
    progress: { downloaded: number };
  };
  assert.equal(data.run.state, 'idle');
  assert.equal(typeof data.progress.downloaded, 'number');
});

test('rejects malformed export requests', async () => {
  const res = await fetch(base + '/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'not json',
  });
  assert.equal(res.status, 400);
  const missing = await fetch(base + '/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'not a url' }),
  });
  assert.equal(missing.status, 400);
});

test('returns 404 for unknown routes', async () => {
  const res = await fetch(base + '/api/nope');
  assert.equal(res.status, 404);
});

test('rejects cross-origin export requests', async () => {
  const res = await fetch(base + '/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: JSON.stringify({ url: 'https://demo.framer.app' }),
  });
  assert.equal(res.status, 403);
});

test('rejects requests with a non-local Host header', async () => {
  const status = await new Promise<number>((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: handle.port,
        path: '/api/status',
        headers: { Host: 'evil.example' },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode || 0);
      }
    );
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 403);
});

test('rejects output directories escaping the working directory', async () => {
  const res = await fetch(base + '/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://demo.framer.app', outDir: '../../outside' }),
  });
  assert.equal(res.status, 400);
  const data = (await res.json()) as { error: string };
  assert.match(data.error, /working directory/);
});

test('event stream sends initial status and progress events', async () => {
  const received = await new Promise<string>((resolve, reject) => {
    const req = http.get(base + '/api/events', (res) => {
      let buffer = '';
      res.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        if (buffer.includes('event: progress')) {
          req.destroy();
          resolve(buffer);
        }
      });
      res.on('error', () => resolve(buffer));
    });
    req.on('error', () => reject(new Error('sse connection failed')));
    setTimeout(() => {
      req.destroy();
      resolve('');
    }, 4000);
  });
  assert.ok(received.includes('event: status'));
  assert.ok(received.includes('event: progress'));
});
