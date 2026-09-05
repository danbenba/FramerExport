import assert from 'node:assert/strict';
import test from 'node:test';
import { collectHtmlResourceUrls } from '../../src/assets/html-refs.js';
const BASE = 'https://example.framer.app/';
test('collects touch icons, scheme-scoped favicons and the manifest', () => {
  const html = `
    <link rel="icon" href="https://cdn.example.com/light.png" media="(prefers-color-scheme: light)">
    <link href="https://cdn.example.com/dark.png" rel="icon" media="(prefers-color-scheme: dark)">
    <link rel="apple-touch-icon" href="https://cdn.example.com/touch.png">
    <link rel="apple-touch-icon-precomposed" href="/touch-pre.png">
    <link rel="mask-icon" href="/mask.svg" color="#000">
    <link rel="manifest" href="/site.webmanifest">
  `;
  assert.deepEqual(collectHtmlResourceUrls(html, BASE), [
    'https://cdn.example.com/light.png',
    'https://cdn.example.com/dark.png',
    'https://cdn.example.com/touch.png',
    'https://example.framer.app/touch-pre.png',
    'https://example.framer.app/mask.svg',
    'https://example.framer.app/site.webmanifest',
  ]);
});
test('collects Open Graph and Twitter preview images', () => {
  const html = `
    <meta property="og:image" content="https://cdn.example.com/og.jpg">
    <meta property="og:image:secure_url" content="https://cdn.example.com/og-secure.jpg">
    <meta name="twitter:image" content="https://cdn.example.com/tw.jpg">
  `;
  assert.deepEqual(collectHtmlResourceUrls(html, BASE), [
    'https://cdn.example.com/og.jpg',
    'https://cdn.example.com/og-secure.jpg',
    'https://cdn.example.com/tw.jpg',
  ]);
});
test('ignores unrelated link rels and meta tags', () => {
  const html = `
    <link rel="stylesheet" href="https://cdn.example.com/app.css">
    <link rel="preconnect" href="https://fonts.gstatic.com">
    <link rel="canonical" href="https://example.framer.app/about">
    <meta name="description" content="https://cdn.example.com/not-an-asset.png">
    <meta property="og:title" content="Example">
  `;
  assert.deepEqual(collectHtmlResourceUrls(html, BASE), []);
});
test('skips data URIs and non-http schemes, and de-duplicates', () => {
  const html = `
    <link rel="icon" href="data:image/png;base64,AAAA">
    <link rel="apple-touch-icon" href="ftp://example.com/icon.png">
    <meta property="og:image" content="https://cdn.example.com/same.jpg">
    <meta name="twitter:image" content="https://cdn.example.com/same.jpg">
  `;
  assert.deepEqual(collectHtmlResourceUrls(html, BASE), ['https://cdn.example.com/same.jpg']);
});
test('handles single quotes, unquoted values and HTML-escaped ampersands', () => {
  const html = `
    <link rel='apple-touch-icon' href='https://cdn.example.com/a.png'>
    <link rel=icon href=https://cdn.example.com/b.png>
    <meta property="og:image" content="https://cdn.example.com/c.jpg?w=1&amp;h=2">
  `;
  assert.deepEqual(collectHtmlResourceUrls(html, BASE), [
    'https://cdn.example.com/a.png',
    'https://cdn.example.com/b.png',
    'https://cdn.example.com/c.jpg?w=1&h=2',
  ]);
});
test('matches rel token lists case-insensitively', () => {
  const html = `<link REL="SHORTCUT ICON" HREF="https://cdn.example.com/fav.ico">`;
  assert.deepEqual(collectHtmlResourceUrls(html, BASE), ['https://cdn.example.com/fav.ico']);
});
