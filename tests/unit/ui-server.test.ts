import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startUiServer, type UiServerHandle } from '../../src/ui/server.js';
import { FramerExporter } from '../../src/exporter/index.js';
import { log, suspendConsoleOutput } from '../../src/logger/index.js';

let handle: UiServerHandle;
let base = '';
let preferencesHome = '';

test.before(async () => {
  preferencesHome = await fs.mkdtemp(path.join(os.tmpdir(), 'fexport-ui-unit-'));
  handle = await startUiServer(0, { quiet: true, preferencesHome });
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
  assert.ok(html.includes('screen-review'));
  assert.ok(html.includes('Export steps'));
  assert.ok(html.includes('pixel-blast.js'));
  assert.ok(!html.includes('<footer>'));
  assert.ok(!html.includes('Your export workspace'));
  assert.ok(html.includes('<span>framer</span><strong>export</strong>'));
});

test('serves valid application and background scripts locally', async () => {
  const app = await (await fetch(base + '/app.js')).text();
  assert.ok(app.includes('loadGallery'));
  assert.ok(app.includes('EventSource'));
  assert.doesNotThrow(() => new Function(app));
  const background = await fetch(base + '/pixel-blast.js');
  assert.equal(background.status, 200);
  const backgroundScript = await background.text();
  assert.doesNotThrow(() => new Function(backgroundScript));
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
  const beta = all.filter((p) => p.beta).map((p) => p.name);
  assert.deepEqual(beta, ['bubble', 'notion', 'podia']);
  assert.equal(all.filter((p) => !p.beta).length, 22);
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

test('stores shared preferences and drafts in the isolated preferences directory', async () => {
  const post = (route: string, value: unknown) =>
    fetch(base + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
    });
  const preferences = await (await fetch(base + '/api/preferences')).json();
  assert.equal(preferences.defaultProvider, 'auto');
  assert.equal(preferences.viewMode, 'cards');
  assert.equal(
    (await post('/api/preferences', { defaultProvider: 'carrd', viewMode: 'list' })).status,
    200
  );
  const saved = await (await fetch(base + '/api/preferences')).json();
  assert.equal(saved.defaultProvider, 'carrd');
  assert.equal(saved.viewMode, 'list');
  assert.equal(saved.concurrency, preferences.concurrency);
  const draft = {
    provider: 'carrd',
    siteUrl: 'https://example.test',
    outDir: './my-site',
    prettyPrint: false,
    includeSubpages: true,
    concurrency: 6,
    step: 3,
  };
  assert.equal((await post('/api/draft', draft)).status, 200);
  assert.deepEqual((await (await fetch(base + '/api/draft')).json()).draft, {
    schemaVersion: 1,
    ...draft,
  });
  assert.equal(
    JSON.parse(await fs.readFile(path.join(preferencesHome, 'settings.json'), 'utf8'))
      .defaultProvider,
    'carrd'
  );
  assert.equal((await post('/api/draft', { ...draft, siteUrl: 'file:///private' })).status, 400);
  const crossOrigin = await fetch(base + '/api/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://external.test' },
    body: JSON.stringify({ viewMode: 'cards' }),
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal((await (await fetch(base + '/api/preferences')).json()).viewMode, 'list');
});

test('reports idle status with a progress snapshot', async () => {
  const data = (await (await fetch(base + '/api/status')).json()) as {
    run: { state: string };
    progress: { downloaded: number };
  };
  assert.equal(data.run.state, 'idle');
  assert.equal(typeof data.progress.downloaded, 'number');
});

test('reset requires confirmation and same origin, then clears application state while preserving exports', async () => {
  const reset = (body: unknown, origin?: string) =>
    fetch(base + '/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
      body: JSON.stringify(body),
    });
  const exported = path.join(preferencesHome, 'kept-export.html');
  await fs.writeFile(exported, '<main>Keep this export</main>');
  await fs.writeFile(path.join(preferencesHome, 'update-cache.json'), '{}');
  assert.equal((await reset({ confirmed: true }, 'https://external.test')).status, 403);
  for (const value of [{}, { confirmed: false }, { confirmed: 'true' }, null, []]) {
    assert.equal((await reset(value)).status, 400);
  }
  assert.equal((await (await fetch(base + '/api/preferences')).json()).defaultProvider, 'carrd');
  assert((await (await fetch(base + '/api/draft')).json()).draft);
  const response = await reset({ confirmed: true });
  assert.equal(response.status, 200);
  const preferences = await response.json();
  assert.equal(preferences.defaultProvider, 'auto');
  assert.equal(preferences.onboardingCompleted, false);
  assert.equal(preferences.viewMode, 'cards');
  assert.equal((await (await fetch(base + '/api/draft')).json()).draft, null);
  for (const filename of ['settings.json', 'draft.json', 'update-cache.json']) {
    await assert.rejects(fs.access(path.join(preferencesHome, filename)), { code: 'ENOENT' });
  }
  assert.equal(await fs.readFile(exported, 'utf8'), '<main>Keep this export</main>');
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

test('rejects unsupported URL schemes and embedded credentials before starting an export', async () => {
  for (const url of [
    'javascript:alert(1)',
    'file:///tmp/site.html',
    'https://user:secret@example.test/',
  ]) {
    const res = await fetch(base + '/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    assert.equal(res.status, 400, url);
  }
  const state = (await (await fetch(base + '/api/status')).json()) as { run: { state: string } };
  assert.equal(state.run.state, 'idle');
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

test('completed web exports retain every log line in the saved file and copy endpoint', async (t) => {
  const outDir = await fs.mkdtemp(path.resolve('tmp/ui-log-retention-'));
  const restoreOutput = suspendConsoleOutput();
  t.after(restoreOutput);
  t.mock.method(FramerExporter.prototype, 'run', async function (this: FramerExporter) {
    for (let index = 0; index < 5101; index++) log(`Retained web entry ${index}`);
    await (this as unknown as { writeExportLog(): Promise<void> }).writeExportLog();
  });
  const response = await fetch(base + '/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.test', outDir }),
  });
  assert.equal(response.status, 202);
  let state = '';
  for (let attempt = 0; attempt < 100; attempt++) {
    state = (await (await fetch(base + '/api/status')).json()).run.state;
    if (state !== 'running') break;
    await delay(10);
  }
  assert.equal(state, 'done');
  const saved = await fs.readFile(path.join(outDir, 'export.log'), 'utf8');
  const copied = await (await fetch(base + '/api/log')).text();
  for (const output of [saved, copied]) {
    assert.match(output, /Retained web entry 0\n/);
    assert.match(output, /Retained web entry 5100\n/);
    assert.equal(output.match(/Retained web entry \d+/g)?.length, 5101);
  }
  assert.match(copied, /Full export log written/);
});
