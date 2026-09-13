import assert from 'node:assert/strict';
import test from 'node:test';
import { notion } from '../../src/platforms/cms/notion.js';
import { podia } from '../../src/platforms/course/podia.js';
import { webflow } from '../../src/platforms/webflow.js';
import type { ExporterContext } from '../../src/types.js';

const ctx = {} as ExporterContext;

test('Webflow badge cleanup keeps the html element and runtime page/site identifiers', () => {
  const html =
    '<!DOCTYPE html><html data-wf-domain="example.webflow.io" data-wf-page="page-id" data-wf-site="site-id" data-wf-status="1" lang="en">' +
    '<head><style>body{margin:0}.w-webflow-badge{display:block}</style></head><body><p>Page</p><a class="w-webflow-badge" href="https://webflow.com">Made in Webflow</a></body></html>';
  const stripped = webflow.stripPatterns.reduce((text, pattern) => text.replace(pattern, ''), html);
  const output = webflow.postCapture!(stripped, ctx);
  assert.match(output, /^<!DOCTYPE html><html\s/);
  assert.doesNotMatch(output, /data-wf-domain|data-wf-status/);
  assert.match(output, /data-wf-page="page-id"/);
  assert.match(output, /data-wf-site="site-id"/);
  assert.match(output, /lang="en"/);
  assert.match(output, /body\{margin:0\}/);
  assert.doesNotMatch(output, /Made in Webflow/);
});

test('notion postCapture strips executable scripts but keeps JSON payloads', () => {
  const html =
    '<html><head>' +
    '<script src="/_assets/app-d1791b3f9dec0af4.js" async=""></script>' +
    '<script>window.__notion_boot_data={};</script>' +
    '<script type="application/ld+json">{"@type":"WebSite"}</script>' +
    '<script type="application/json" id="theme-data">{"mode":"light"}</script>' +
    '<style>.a{color:red}</style>' +
    '<link rel="stylesheet" href="styles/main.css">' +
    '</head><body><div id="notion-app"><p>Content</p></div></body></html>';
  const out = notion.postCapture!(html, ctx);
  assert.doesNotMatch(out, /_assets\/app-/);
  assert.doesNotMatch(out, /__notion_boot_data/);
  assert.match(out, /application\/ld\+json/);
  assert.match(out, /"theme-data"/);
  assert.match(out, /<style>\.a\{color:red\}<\/style>/);
  assert.match(out, /styles\/main\.css/);
  assert.match(out, /<p>Content<\/p>/);
});

test('podia postCapture strips storefront and turbo scripts but keeps markup and styles', () => {
  const html =
    '<html><head>' +
    '<script src="scripts/vendor/storefront-c00f778f44af300f873851cf9bf8a5.js" data-turbo-track="reload"></script>' +
    '<script src="scripts/vendor/user-site-a17f877f0c0d.js" data-turbo-track="reload"></script>' +
    '<script>Turbo.setProgressBarDelay(500);</script>' +
    '<script type="application/ld+json">{"@type":"Organization"}</script>' +
    '<style id="custom-storefront-styles">:root{--accent:#808000}</style>' +
    '</head><body><section class="react-page-section"><h1>Hero</h1></section></body></html>';
  const out = podia.postCapture!(html, ctx);
  assert.doesNotMatch(out, /storefront-c00f/);
  assert.doesNotMatch(out, /user-site-/);
  assert.doesNotMatch(out, /Turbo\.setProgressBarDelay/);
  assert.match(out, /application\/ld\+json/);
  assert.match(out, /custom-storefront-styles/);
  assert.match(out, /<h1>Hero<\/h1>/);
});
