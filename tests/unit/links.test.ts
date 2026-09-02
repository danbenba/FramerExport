import assert from 'node:assert/strict';
import test from 'node:test';
import { extractInternalLinks, normalizeInternalLink, hostKey } from '../../src/exporter/links.js';
const HOST = 'example.com';
test('hostKey strips www and lowercases', () => {
  assert.equal(hostKey('WWW.Example.com'), 'example.com');
  assert.equal(hostKey('example.com'), 'example.com');
});
test('normalizeInternalLink resolves relative hrefs against the current page, not the site root', () => {
  assert.equal(
    normalizeInternalLink('post-1', 'https://example.com/blog/', HOST),
    'https://example.com/blog/post-1'
  );
  assert.equal(
    normalizeInternalLink('../about', 'https://example.com/blog/post-1', HOST),
    'https://example.com/about'
  );
  assert.equal(
    normalizeInternalLink('/pricing', 'https://example.com/blog/post-1', HOST),
    'https://example.com/pricing'
  );
});
test('normalizeInternalLink drops hashes and trailing slashes so duplicates collapse', () => {
  const a = normalizeInternalLink('https://example.com/about/', 'https://example.com/', HOST);
  const b = normalizeInternalLink('https://example.com/about#team', 'https://example.com/', HOST);
  const c = normalizeInternalLink('/about', 'https://example.com/', HOST);
  assert.equal(a, 'https://example.com/about');
  assert.equal(a, b);
  assert.equal(a, c);
});
test('normalizeInternalLink rejects the home page, external hosts, non-http schemes and assets', () => {
  const page = 'https://example.com/';
  assert.equal(normalizeInternalLink('/', page, HOST), null);
  assert.equal(normalizeInternalLink('https://example.com', page, HOST), null);
  assert.equal(normalizeInternalLink('#top', page, HOST), null);
  assert.equal(normalizeInternalLink('mailto:hi@example.com', page, HOST), null);
  assert.equal(normalizeInternalLink('tel:+33600000000', page, HOST), null);
  assert.equal(normalizeInternalLink('javascript:void(0)', page, HOST), null);
  assert.equal(normalizeInternalLink('https://other.com/page', page, HOST), null);
  assert.equal(normalizeInternalLink('/brochure.pdf', page, HOST), null);
  assert.equal(normalizeInternalLink('/hero.png', page, HOST), null);
  assert.equal(normalizeInternalLink('', page, HOST), null);
});
test('normalizeInternalLink treats www and bare host as the same site', () => {
  assert.equal(
    normalizeInternalLink('https://www.example.com/about', 'https://example.com/', HOST),
    'https://www.example.com/about'
  );
});
test('extractInternalLinks scans anchors with double, single and unquoted hrefs', () => {
  const html = `
    <a href="/about">About</a>
    <a class="x" href='/contact'>Contact</a>
    <a href=/pricing>Pricing</a>
    <a href="https://example.com/blog/">Blog</a>
    <a href="https://external.com/">Ext</a>
    <a href="#hero">Top</a>
    <a href="mailto:a@b.c">Mail</a>
  `;
  assert.deepEqual(extractInternalLinks(html, 'https://example.com/', HOST), [
    'https://example.com/about',
    'https://example.com/contact',
    'https://example.com/pricing',
    'https://example.com/blog',
  ]);
});
test('extractInternalLinks dedupes and decodes &amp; in query strings', () => {
  const html = `
    <a href="/about">A</a><a href="/about/">B</a><a href="/about#x">C</a>
    <a href="/search?q=1&amp;page=2">S</a>
  `;
  assert.deepEqual(extractInternalLinks(html, 'https://example.com/', HOST), [
    'https://example.com/about',
    'https://example.com/search?q=1&page=2',
  ]);
});
test('extractInternalLinks finds links only reachable from a sub-page (depth > 1)', () => {
  const home = '<a href="/blog">Blog</a>';
  const blog = '<a href="/blog/post-1">P1</a><a href="post-2">P2</a><a href="/">Home</a>';
  const fromHome = extractInternalLinks(home, 'https://example.com/', HOST);
  assert.deepEqual(fromHome, ['https://example.com/blog']);
  // the browser lands on /blog/ (trailing slash), so relative hrefs resolve inside /blog/
  const fromBlog = extractInternalLinks(blog, fromHome[0] + '/', HOST);
  assert.deepEqual(fromBlog, [
    'https://example.com/blog/post-1',
    'https://example.com/blog/post-2',
  ]);
});
