import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetMap, replaceUrl } from '../../src/assets/asset-map.js';
import { framer } from '../../src/platforms/framer.js';
test('replaceUrl returns the text unchanged when the URL does not occur', () => {
  assert.equal(replaceUrl('nothing here', 'https://x.com/a.js', './a.js'), 'nothing here');
});
test('replaceUrl rewrites every non-prefix occurrence', () => {
  const text = 'a https://x.com/a.js b https://x.com/a.js c';
  assert.equal(replaceUrl(text, 'https://x.com/a.js', './a.js'), 'a ./a.js b ./a.js c');
});
test('framer images route to assets/images', () => {
  const map = new AssetMap();
  assert.equal(
    map.localPathFor('https://framerusercontent.com/images/hero.png', framer),
    'assets/images/hero.png'
  );
});
test('framer /assets/ fonts route to assets/fonts, non-fonts to assets/misc', () => {
  const map = new AssetMap();
  assert.equal(
    map.localPathFor('https://framerusercontent.com/assets/Inter.woff2', framer),
    'assets/fonts/Inter.woff2'
  );
  assert.equal(
    map.localPathFor('https://framerusercontent.com/assets/notes.txt', framer),
    'assets/misc/notes.txt'
  );
});
test('framer /sites/ routes by extension (vendor scripts, styles, data)', () => {
  const map = new AssetMap();
  assert.equal(
    map.localPathFor('https://framerusercontent.com/sites/x/chunk.mjs', framer),
    'scripts/vendor/chunk.mjs'
  );
  assert.equal(
    map.localPathFor('https://framerusercontent.com/sites/x/main.css', framer),
    'styles/main.css'
  );
  assert.equal(
    map.localPathFor('https://framerusercontent.com/sites/x/cms.framercms', framer),
    'data/cms.framercms'
  );
  assert.equal(
    map.localPathFor('https://framerusercontent.com/sites/x/site.json', framer),
    'data/site.json'
  );
});
test('framer /modules/ routes to scripts/modules', () => {
  const map = new AssetMap();
  assert.equal(
    map.localPathFor('https://framerusercontent.com/modules/Nav.mjs', framer),
    'scripts/modules/Nav.mjs'
  );
});
test('google fonts hosts fall back to assets/fonts', () => {
  const map = new AssetMap();
  assert.equal(
    map.localPathFor('https://fonts.gstatic.com/s/inter/v12/font.woff2'),
    'assets/fonts/font.woff2'
  );
  assert.match(
    map.localPathFor('https://fonts.googleapis.com/css2?family=Inter')!,
    /^assets\/fonts\//
  );
});
test('unknown-host scripts fall back to scripts/vendor, other files to assets/misc', () => {
  const map = new AssetMap();
  assert.equal(map.localPathFor('https://cdn.example.com/app.js'), 'scripts/vendor/app.js');
  assert.equal(map.localPathFor('https://cdn.example.com/lib.mjs'), 'scripts/vendor/lib.mjs');
  assert.equal(map.localPathFor('https://cdn.example.com/pic.webp'), 'assets/misc/pic.webp');
});
test('querystring is stripped from the extension and the base URL is aliased', () => {
  const map = new AssetMap();
  const local = map.localPathFor('https://cdn.example.com/chunk.mjs?v=123');
  assert.equal(local, 'scripts/vendor/chunk.mjs');
  assert.equal(map.entries.get('https://cdn.example.com/chunk.mjs')?.localPath, local);
});
test('extension-less basenames get a stable 6-char hash suffix', () => {
  const map = new AssetMap();
  const first = map.localPathFor('https://example.com/data/blob');
  assert.match(first!, /^assets\/misc\/blob-[a-f0-9]{6}$/);
  assert.equal(new AssetMap().localPathFor('https://example.com/data/blob'), first);
});
test('a bare root path yields a hashed asset-* filename', () => {
  const map = new AssetMap();
  assert.match(map.localPathFor('https://example.com/')!, /^assets\/misc\/asset-[a-f0-9]{6}$/);
});
test('unsafe filename characters are sanitized to underscores', () => {
  const map = new AssetMap();
  const local = map.localPathFor('https://example.com/img/my image (1).png');
  assert.match(local!, /^assets\/misc\/[a-zA-Z0-9._-]+\.png$/);
});
test('invalid URLs return null', () => {
  const map = new AssetMap();
  assert.equal(map.localPathFor('not-a-url'), null);
  assert.equal(map.localPathFor(''), null);
});
test('repeated lookups are cached and stable', () => {
  const map = new AssetMap();
  const a = map.localPathFor('https://cdn.example.com/app.js');
  const b = map.localPathFor('https://cdn.example.com/app.js');
  assert.equal(a, b);
  assert.equal(map.entries.size, 1);
});
test('rewrite maps registered URLs to root-relative paths from the root dir', () => {
  const map = new AssetMap();
  map.localPathFor('https://framerusercontent.com/images/hero.png', framer);
  assert.equal(
    map.rewrite('<img src="https://framerusercontent.com/images/hero.png">'),
    '<img src="assets/images/hero.png">'
  );
});
test('rewrite computes ../ paths for files that live in a subdirectory', () => {
  const map = new AssetMap();
  map.localPathFor('https://framerusercontent.com/images/hero.png', framer);
  assert.equal(
    map.rewrite('url(https://framerusercontent.com/images/hero.png)', 'subpages'),
    'url(../assets/images/hero.png)'
  );
});
test('rewrite keeps same-directory references explicitly relative for dynamic import', () => {
  const map = new AssetMap();
  map.localPathFor('https://cdn.example.com/chunk.mjs');
  assert.equal(
    map.rewrite('import("https://cdn.example.com/chunk.mjs")', 'scripts/vendor'),
    'import("./chunk.mjs")'
  );
});
test('rewrite also replaces the &amp;-encoded form of query URLs', () => {
  const map = new AssetMap();
  map.localPathFor('https://cdn.example.com/a.png?x=1&y=2');
  const out = map.rewrite('<img src="https://cdn.example.com/a.png?x=1&amp;y=2">');
  assert.equal(out, '<img src="assets/misc/a.png">');
});
test('rewrite replaces longer URLs before their prefixes', () => {
  const map = new AssetMap();
  map.localPathFor('https://cdn.example.com/app.js');
  map.localPathFor('https://cdn.example.com/app.js.map');
  const out = map.rewrite('https://cdn.example.com/app.js.map https://cdn.example.com/app.js');
  assert.equal(out, 'assets/misc/app.js.map scripts/vendor/app.js');
});
