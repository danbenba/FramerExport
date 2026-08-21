import assert from 'node:assert/strict';
import test from 'node:test';
import { FramerExporter, deriveOutputName } from '../../src/exporter/index.js';
const SUFFIX = /-[a-z]+-[a-z]+-[a-z0-9]{4}$/;
test('deriveOutputName uses the framer subdomain as the site name', () => {
  assert.match(deriveOutputName('https://acme.framer.app/', 'framer'), /^framer-acme-/);
  assert.match(deriveOutputName('https://acme.framer.website/', 'framer'), /^framer-acme-/);
  assert.match(deriveOutputName('https://acme.framer.ai/', 'framer'), /^framer-acme-/);
});
test('deriveOutputName strips the .webflow.io suffix', () => {
  assert.match(deriveOutputName('https://my-site.webflow.io/', 'webflow'), /^webflow-my-site-/);
});
test('deriveOutputName takes the wixsite.com site name from the path', () => {
  assert.match(
    deriveOutputName('https://user123.wixsite.com/portfolio/home', 'wix'),
    /^wix-portfolio-/
  );
  assert.match(deriveOutputName('https://user123.wixsite.com/', 'wix'), /^wix-user123-/);
});
test('deriveOutputName turns custom domain dots into dashes', () => {
  assert.match(
    deriveOutputName('https://www.example.co.uk/page', 'wordpress'),
    /^wordpress-www-example-co-uk-/
  );
});
test('deriveOutputName appends a random adjective-noun-id suffix', () => {
  assert.match(deriveOutputName('https://acme.framer.app/', 'framer'), SUFFIX);
});
test('deriveOutputName falls back to a generic name for invalid URLs', () => {
  const name = deriveOutputName('not a url at all', 'framer');
  assert.match(name, /^framer-export-output-/);
  assert.match(name, SUFFIX);
});
function slug(link: string): string {
  const exporter = new FramerExporter('https://acme.framer.app/', 'unused-out-dir');
  return (
    exporter as unknown as {
      deriveSlug(l: string, b: URL): string;
    }
  ).deriveSlug(link, new URL('https://acme.framer.app/'));
}
test('deriveSlug maps the root path to index', () => {
  assert.equal(slug('https://acme.framer.app/'), 'index');
  assert.equal(slug('https://acme.framer.app'), 'index');
});
test('deriveSlug joins nested paths with underscores', () => {
  assert.equal(slug('https://acme.framer.app/about'), 'about');
  assert.equal(slug('https://acme.framer.app/blog/post'), 'blog_post');
});
test('deriveSlug drops trailing slashes before slugifying', () => {
  assert.equal(slug('https://acme.framer.app/about/'), 'about');
});
test('deriveSlug replaces unsafe characters and collapses runs of underscores', () => {
  assert.equal(slug('https://acme.framer.app/caf%C3%A9/menu'), 'caf_C3_A9_menu');
  assert.equal(slug('https://acme.framer.app/a//b'), 'a_b');
});
test('deriveSlug falls back to page for unparseable links', () => {
  assert.equal(slug('::::not-a-url'), 'page');
});
