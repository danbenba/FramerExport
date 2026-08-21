import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { SERVE_SCRIPT } from '../../src/server/template.js';
const PORT = 20000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
function rawRequest(rawPath: string): Promise<{
  status: number;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: PORT, path: rawPath, method: 'GET' },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}
test('SERVE_SCRIPT serves the exported mirror correctly', async (t) => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'framer-export-serve-test-'));
  await fs.mkdir(path.join(outDir, 'subpages'));
  await fs.mkdir(path.join(outDir, 'styles'));
  await fs.writeFile(path.join(outDir, 'serve.js'), SERVE_SCRIPT);
  await fs.writeFile(path.join(outDir, 'package.json'), '{"type":"module"}\n');
  await fs.writeFile(path.join(outDir, 'index.html'), '<html><body>INDEX_SHELL</body></html>');
  await fs.writeFile(
    path.join(outDir, 'subpages', 'about.html'),
    '<html><body>ABOUT_SUBPAGE</body></html>'
  );
  await fs.writeFile(path.join(outDir, 'styles', 'main.css'), 'body{margin:0}');
  let child: ChildProcess | null = null;
  t.after(async () => {
    if (child && !child.killed) child.kill();
    await sleep(150);
    await fs.rm(outDir, { recursive: true, force: true, maxRetries: 5 });
  });
  child = spawn(process.execPath, ['serve.js'], {
    cwd: outDir,
    env: { ...process.env, PORT: String(PORT), NO_COLOR: '1' },
    stdio: 'ignore',
  });
  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (child.exitCode !== null) break;
    try {
      const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(500) });
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {}
    await sleep(100);
  }
  assert.ok(ready, 'serve.js never answered on port ' + PORT);
  await t.test('/ serves index.html with the HTML MIME type', async () => {
    const res = await fetch(`${BASE}/`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.match(await res.text(), /INDEX_SHELL/);
  });
  await t.test('/about falls back to subpages/about.html (slug routing)', async () => {
    const res = await fetch(`${BASE}/about`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /ABOUT_SUBPAGE/);
  });
  await t.test('unknown extension-less paths fall back to the SPA shell', async () => {
    const res = await fetch(`${BASE}/no-such-route`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /INDEX_SHELL/);
  });
  await t.test('.css files get the CSS MIME type and a CORS header', async () => {
    const res = await fetch(`${BASE}/styles/main.css`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/css; charset=utf-8');
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
  });
  await t.test('missing files with an extension return 404', async () => {
    const res = await fetch(`${BASE}/missing.png`);
    assert.equal(res.status, 404);
  });
  await t.test('path traversal outside the export root is blocked', async () => {
    const res = await rawRequest('/../package.json');
    assert.equal(res.status, 403);
  });
});
