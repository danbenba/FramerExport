import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetMap } from '../../src/assets/asset-map.js';
import {
  documentBaseUrl,
  rewriteHtmlResources,
  rewriteModuleSpecifiers,
} from '../../src/exporter/html-rewrite.js';
import { rewriteInternalLinks } from '../../src/exporter/output.js';
import { collectHtmlResourceUrls } from '../../src/assets/html-refs.js';

test('subpage resources use document base, preserve SVG fragments and strip remote base href', () => {
  const assets = new AssetMap();
  const css = assets.localPathFor('https://cdn.example.com/theme/site.css');
  const image = assets.localPathFor('https://cdn.example.com/theme/photo.svg');
  const html =
    '<base href="https://cdn.example.com/theme/" target="_blank"><link rel="stylesheet" href="site.css"><img src="photo.svg#icon">';
  const base = documentBaseUrl(html, 'https://example.com/blog/page');
  const result = rewriteHtmlResources(html, base, 'subpages', assets);
  assert.ok(result.includes(`href="../${css}"`));
  assert.ok(result.includes(`src="../${image}#icon"`));
  assert.match(result, /<base target="_blank">/);
  assert.doesNotMatch(result, /https:\/\/cdn/);
});

test('same relative filename on different source pages resolves to the matching asset', () => {
  const assets = new AssetMap();
  assets.localPathFor('https://example.com/a/photo.png');
  const second = assets.localPathFor('https://example.com/b/photo.png');
  const result = rewriteHtmlResources(
    '<img src="photo.png">',
    'https://example.com/b/page',
    'subpages',
    assets
  );
  assert.equal(result, `<img src="../${second}">`);
});

test('inline CSS preserves pseudo-element strings and localizes resource URLs', () => {
  const assets = new AssetMap();
  const image = assets.localPathFor('https://example.com/theme/bg.svg');
  const result = rewriteHtmlResources(
    '<style>a::before{content:"<img src=untouched>"}a{background:url(bg.svg)}</style><div style="background:url(bg.svg)"></div>',
    'https://example.com/theme/',
    '',
    assets
  );
  assert.match(result, /content:"<img src=untouched>"/);
  assert.equal(result.split(image!).length - 1, 2);
});

test('form actions continue to point at original backend instead of posting to static server', () => {
  const result = rewriteHtmlResources(
    '<form action="../register" method="post"><button formaction="/join">Join</button></form>',
    'https://example.com/account/form',
    '',
    new AssetMap()
  );
  assert.match(result, /action="https:\/\/example.com\/register"/);
  assert.match(result, /formaction="https:\/\/example.com\/join"/);
});

test('nested subpage navigation resolves siblings from current page and preserves query/hash', () => {
  assert.equal(
    rewriteInternalLinks(
      '<a href="other?lang=fr#section">Other</a>',
      'https://example.com/',
      new Map([['/blog/other', 'blog_other.html']]),
      true,
      'https://example.com/blog/post'
    ),
    '<a href="blog_other.html?lang=fr#section">Other</a>'
  );
});

test('module imports follow actual source directory after filename collision', () => {
  const assets = new AssetMap();
  assets.localPathFor('https://cdn.example.com/one/chunk.js');
  const second = assets.localPathFor('https://cdn.example.com/two/chunk.js');
  const result = rewriteModuleSpecifiers(
    'import { x } from "./chunk.js"; export {x} from "./chunk.js"; import("./chunk.js")',
    'https://cdn.example.com/two/main.js',
    'scripts/vendor',
    assets
  );
  assert.equal(result.split(second!.split('/').at(-1)!).length - 1, 3);
});

test('minified module syntax is rewritten without touching strings, comments or regex literals', () => {
  const assets = new AssetMap();
  assets.localPathFor('https://cdn.example/one/chunk.js');
  const local = assets.localPathFor('https://cdn.example/two/chunk.js')!.split('/').at(-1)!;
  const unchanged = `const text="import('./chunk.js')";const pattern=/import[(']chunk/;/* import './chunk.js' */`;
  const source = `import{x}from"./chunk.js";export{x}from"./chunk.js";${unchanged}const load=import(\`./chunk.js\`);`;
  const result = rewriteModuleSpecifiers(
    source,
    'https://cdn.example/two/main.js',
    'scripts/vendor',
    assets
  );
  assert.ok(result.includes(unchanged));
  assert.ok(result.includes(`import{x}from"./${local}"`));
  assert.ok(result.includes(`export{x}from"./${local}"`));
  assert.ok(result.includes(`const load=import("./${local}")`));
});

test('module rewriting handles export-from strings as data and interpolated dynamic imports as code', () => {
  const assets = new AssetMap();
  assets.localPathFor('https://cdn.example/one/chunk.js');
  const local = assets.localPathFor('https://cdn.example/two/chunk.js')!.split('/').at(-1)!;
  const source = `export const message="an example from './chunk.js'";const template=\`loaded: \${await import('./chunk.js')}\`;`;
  const result = rewriteModuleSpecifiers(
    source,
    'https://cdn.example/two/main.js',
    'scripts/vendor',
    assets
  );
  assert.ok(result.includes(`export const message="an example from './chunk.js'"`));
  assert.ok(result.includes(`await import("./${local}")`));
  assert.equal(
    rewriteModuleSpecifiers(
      'unparseable {{{ import("./chunk.js")',
      'https://cdn.example/two/main.js',
      'scripts/vendor',
      assets
    ),
    'unparseable {{{ import("./chunk.js")'
  );
});

test('quoted greater-than attributes do not truncate HTML resource scanning or rewriting', () => {
  const assets = new AssetMap();
  const image = assets.localPathFor('https://example.com/image.png');
  const html =
    '<img alt="Score > 10" src="image.png"><div style="--label: \'a > b\'; background:url(image.png)"></div>';
  assert.deepEqual(collectHtmlResourceUrls(html, 'https://example.com/'), [
    'https://example.com/image.png',
  ]);
  const result = rewriteHtmlResources(html, 'https://example.com/', '', assets);
  assert.ok(result.includes(`src="${image}"`));
  assert.ok(result.includes(`url(&quot;${image}&quot;)`));
  assert.ok(result.includes('alt="Score > 10"'));
});

test('markup examples in script, comments and textarea cannot override the actual document base', () => {
  const html =
    '<!-- <base href="https://wrong.example/"> --><script>const example = \'<base href="https://wrong.example/">\';</script><textarea><base href="https://wrong.example/"><img src="fake.png"></textarea><base title="2 > 1" href="https://cdn.example/theme/"><img src="real.png">';
  assert.equal(documentBaseUrl(html, 'https://example.com/'), 'https://cdn.example/theme/');
  assert.deepEqual(collectHtmlResourceUrls(html, 'https://example.com/'), [
    'https://cdn.example/theme/real.png',
  ]);
  const result = rewriteHtmlResources(html, 'https://cdn.example/theme/', '', new AssetMap());
  assert.ok(
    result.includes('<textarea><base href="https://wrong.example/"><img src="fake.png"></textarea>')
  );
});

test('canonical and form backend URLs remain original even when the document was captured as a resource', () => {
  const assets = new AssetMap();
  assets.localPathFor('https://example.com/signup', undefined, 'text/html');
  const html =
    '<link rel="canonical" href="https://example.com/signup"><form action="https://example.com/signup"></form>';
  assert.equal(rewriteHtmlResources(html, 'https://example.com/', '', assets), html);
});

test('resource rewrites preserve literal entities in data URLs and escaped query values', () => {
  const assets = new AssetMap();
  const image = assets.localPathFor('https://example.com/image.png?text=&amp;');
  const result = rewriteHtmlResources(
    '<img srcset="data:image/svg+xml,&lt;svg/&gt; 1x, image.png?text=&amp;amp; 2x">',
    'https://example.com/',
    '',
    assets
  );
  assert.equal(result, `<img srcset="data:image/svg+xml,&lt;svg/&gt; 1x, ${image} 2x">`);
});

test('existing import-map keys and relative module aliases survive generic resource rewriting', () => {
  const assets = new AssetMap();
  assets.localPathFor('https://cdn.example/main.js');
  const html =
    '<script type="importmap">{"imports":{"https://cdn.example/main.js":"./main.js"}}</script>';
  assert.equal(rewriteHtmlResources(html, 'https://example.com/', '', assets), html);
});

test('explicit JSON worker declarations are collected and slash-escaped asset URLs are localized', () => {
  const html =
    '<script type="application/json">{"platform":{"clientWorkerUrl":"https:\\/\\/cdn.example\\/worker.js"},"requestUrl":"https:\\/\\/example.com\\/","apiUrl":"https:\\/\\/example.com\\/api"}</script>';
  assert.deepEqual(collectHtmlResourceUrls(html, 'https://example.com/'), [
    'https://cdn.example/worker.js',
  ]);
  const assets = new AssetMap();
  const worker = assets.localPathFor('https://cdn.example/worker.js')!;
  assets.localPathFor('https://example.com/', undefined, 'text/html');
  const result = rewriteHtmlResources(html, 'https://example.com/', 'subpages', assets);
  const data = JSON.parse(result.match(/<script[^>]*>([\s\S]*)<\/script>/)![1]);
  assert.equal(data.platform.clientWorkerUrl, '../' + worker);
  assert.equal(data.requestUrl, 'https://example.com/');
  assert.equal(data.apiUrl, 'https://example.com/api');
});

test('navigation only rewrites actual href attributes, including bare values', () => {
  const routes = new Map([['/about', 'about.html']]);
  const examples =
    '<script>const example = \'<a href="/about">about</a>\';</script><!-- <a href="/about"> -->';
  const html = examples + '<a data-href="/about" title="2 > 1" href=/about>Go</a>';
  assert.equal(
    rewriteInternalLinks(html, 'https://example.com/', routes, false),
    examples + '<a data-href="/about" title="2 > 1" href="subpages/about.html">Go</a>'
  );
});

test('attribute-looking text inside another quoted attribute cannot replace real attributes', () => {
  const html = `<base title="example href='https://wrong.example/'" href="https://example.com/"><img title="example src='wrong.png'" src="real.png"><a title="example href='/about'" href="/about">Go</a>`;
  assert.equal(documentBaseUrl(html, 'https://fallback.example/'), 'https://example.com/');
  assert.deepEqual(collectHtmlResourceUrls(html, 'https://fallback.example/'), [
    'https://example.com/real.png',
  ]);
  const result = rewriteInternalLinks(
    html,
    'https://example.com/',
    new Map([['/about', 'about.html']]),
    false
  );
  assert.ok(result.includes(`<a title="example href='/about'" href="subpages/about.html">`));
  const resources = rewriteHtmlResources(html, 'https://example.com/', '', new AssetMap());
  assert.ok(resources.includes(`<base title="example href='https://wrong.example/'">`));
});

test('unexported links preserve remote destinations when the source base is removed', () => {
  assert.equal(
    rewriteInternalLinks(
      '<a href="guide">Guide</a>',
      'https://example.com/',
      new Map(),
      true,
      'https://example.com/docs/page'
    ),
    '<a href="https://example.com/docs/guide">Guide</a>'
  );
  assert.equal(
    rewriteInternalLinks(
      '<a href="guide">Guide</a>',
      'https://example.com/',
      new Map(),
      false,
      'https://external.example/docs/'
    ),
    '<a href="https://external.example/docs/guide">Guide</a>'
  );
});
