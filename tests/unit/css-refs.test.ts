import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetMap } from '../../src/assets/asset-map.js';
import {
  collectCssResourceUrls,
  rewriteCssResourceUrls,
  absolutizeCssResourceUrls,
} from '../../src/assets/css-refs.js';

const base = 'https://example.com/styles/main.css';

test('finds nested imports, responsive media assets and image-set URLs with CSS escapes', () => {
  const css = String.raw`@import "../base.css" layer(base); @import url('print.css') print;
    @media(max-width:600px){.hero{background:URL(../img/mobile.svg)}}
    @font-face{src:url('../fonts/font.woff2?#iefix') format('woff2')}
    .x{background:image-set("small.webp" 1x, url(big.webp) 2x);mask:url(../img/a\(b\).svg#shape)}
    .y{background:url(../img/hero\20 image.png)}`;
  assert.deepEqual(collectCssResourceUrls(css, base), [
    { url: 'https://example.com/base.css', isImport: true },
    { url: 'https://example.com/styles/print.css', isImport: true },
    { url: 'https://example.com/img/mobile.svg', isImport: false },
    { url: 'https://example.com/fonts/font.woff2?', isImport: false },
    { url: 'https://example.com/styles/small.webp', isImport: false },
    { url: 'https://example.com/styles/big.webp', isImport: false },
    { url: 'https://example.com/img/a(b).svg', isImport: false },
    { url: 'https://example.com/img/hero%20image.png', isImport: false },
  ]);
});

test('does not fetch comments, content strings, namespace URIs, data URLs or fragment-only masks', () => {
  const css = `/* @import 'fake.css'; url(fake.png) */ @namespace url(https://www.w3.org/1999/xhtml);
    .x:after{content:"url(fake2.png)"}.x{background:url(data:image/png;base64,AAAA);filter:url(#shadow)}`;
  assert.deepEqual(collectCssResourceUrls(css, base), []);
  assert.equal(absolutizeCssResourceUrls(css, base), css);
});

test('rewrites import strings and url() values while preserving SVG fragments and media qualifiers', () => {
  const assets = new AssetMap();
  assets.localPathFor('https://example.com/base.css');
  assets.localPathFor('https://example.com/img/icon.svg');
  const rewritten = rewriteCssResourceUrls(
    `@import '../base.css' screen;.icon{mask:url('../img/icon.svg#shape');background:url(missing.png)}`,
    base,
    'styles',
    assets
  );
  assert.equal(
    rewritten,
    '@import "./base.css" screen;.icon{mask:url("../assets/images/icon.svg#shape");background:url("https://example.com/styles/missing.png")}'
  );
});

test('rebases redirected sheets before their paths are flattened', () => {
  const source = absolutizeCssResourceUrls(
    '@import "nested.css";body{background:url(../hero.svg)}',
    'https://cdn.example.com/final/theme/main.css'
  );
  assert.equal(
    source,
    '@import "https://cdn.example.com/final/theme/nested.css";body{background:url("https://cdn.example.com/final/hero.svg")}'
  );
});
