import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  PLATFORM_REGISTRY,
  CATEGORY_ORDER,
  sortedByPriority,
} from '../../src/platforms/registry.js';
import {
  detectByUrl,
  detectByGenerator,
  detectByHtml,
  detectPlatform,
  getPlatformByName,
  readGenerator,
} from '../../src/platforms/detect.js';
import { framer } from '../../src/platforms/framer.js';
import type { PlatformType } from '../../src/platforms/types.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RESEARCH = path.join(ROOT, 'tests', 'research');
interface ResearchProfile {
  platform: string;
  detectUrlRegex?: string;
  hostingDomains?: string[];
  metaGenerator?: string;
  htmlSignatures?: string[];
}
const profiles: ResearchProfile[] = fs
  .readdirSync(RESEARCH)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(RESEARCH, f), 'utf8')));
test('registry contains exactly 25 platform handlers', () => {
  assert.equal(PLATFORM_REGISTRY.length, 25);
});
test('registry handler names are unique', () => {
  const names = PLATFORM_REGISTRY.map((p) => p.name);
  assert.equal(new Set(names).size, names.length);
});
test('every handler has a valid category and a priority within 0-100', () => {
  for (const p of PLATFORM_REGISTRY) {
    assert.ok(CATEGORY_ORDER.includes(p.category), `${p.name}: invalid category ${p.category}`);
    assert.ok(
      p.priority >= 0 && p.priority <= 100,
      `${p.name}: priority ${p.priority} out of 0-100`
    );
  }
});
test('frozen trio keeps its v4 priorities (framer 95, webflow 90, wix 88)', () => {
  const byName = new Map(PLATFORM_REGISTRY.map((p) => [p.name, p]));
  assert.equal(byName.get('framer')?.priority, 95);
  assert.equal(byName.get('webflow')?.priority, 90);
  assert.equal(byName.get('wix')?.priority, 88);
});
test('frozen trio outranks every newer platform', () => {
  const trio = ['framer', 'webflow', 'wix'];
  const maxNewPriority = Math.max(
    ...PLATFORM_REGISTRY.filter((p) => !trio.includes(p.name)).map((p) => p.priority)
  );
  for (const name of trio) {
    const handler = PLATFORM_REGISTRY.find((p) => p.name === name)!;
    assert.ok(
      handler.priority > maxNewPriority,
      `${name}=${handler.priority} does not outrank newMax=${maxNewPriority}`
    );
  }
});
test('sortedByPriority returns descending priorities without mutating the registry', () => {
  const originalOrder = PLATFORM_REGISTRY.map((p) => p.name);
  const sorted = sortedByPriority();
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i - 1].priority >= sorted[i].priority);
  }
  assert.deepEqual(
    PLATFORM_REGISTRY.map((p) => p.name),
    originalOrder
  );
});
test('detectByUrl resolves the frozen trio URLs exactly as in v4', () => {
  const cases: Array<[string, PlatformType]> = [
    ['https://acme.framer.app', 'framer'],
    ['https://acme.framer.website', 'framer'],
    ['https://acme.webflow.io', 'webflow'],
    ['https://my-site.wixsite.com/home', 'wix'],
  ];
  for (const [url, expected] of cases) {
    assert.equal(detectByUrl(url)?.name, expected, url);
  }
});
test('detectByUrl returns null for a URL no handler claims', () => {
  assert.equal(detectByUrl('https://totally-unrelated.example.org/'), null);
});
test('every research profile has a matching registry handler', () => {
  const names = new Set(PLATFORM_REGISTRY.map((p) => p.name));
  for (const profile of profiles) {
    assert.ok(names.has(profile.platform as PlatformType), profile.platform);
  }
});
for (const profile of profiles) {
  if (profile.detectUrlRegex) {
    test(`${profile.platform}: detectByUrl resolves its hosting domains`, () => {
      const hosting = (profile.hostingDomains || []).filter((d) => d && typeof d === 'string');
      assert.ok(hosting.length > 0, 'profile advertises a detectUrlRegex but no hostingDomains');
      for (const d of hosting) {
        const bare = d.replace(/^https?:\/\//, '').replace(/^\.+/, '');
        const url = `https://demo.${bare}/`;
        assert.equal(detectByUrl(url)?.name, profile.platform, url);
      }
    });
  }
  if (profile.metaGenerator) {
    test(`${profile.platform}: generator meta "${profile.metaGenerator}" is detected`, () => {
      const html = `<meta name="generator" content="${profile.metaGenerator}">`;
      assert.equal(detectByGenerator(html)?.name, profile.platform);
      assert.equal(detectByHtml(html)?.name, profile.platform);
    });
  }
}
test('detectByHtml recognizes Framer markup', () => {
  const html =
    '<html><body><div id="main"></div><script src="https://app.framerstatic.com/x.mjs"></script></body></html>';
  assert.equal(detectByHtml(html)?.name, 'framer');
});
test('detectByHtml recognizes Webflow markup', () => {
  const html = '<html data-wf-site="abc123"><body></body></html>';
  assert.equal(detectByHtml(html)?.name, 'webflow');
});
test('detectByHtml recognizes Wix markup', () => {
  const html = '<html><body><script id="wix-viewer-model"></script></body></html>';
  assert.equal(detectByHtml(html)?.name, 'wix');
});
test('detectByHtml returns null when nothing matches', () => {
  assert.equal(detectByHtml('<html><body><p>plain page</p></body></html>'), null);
});
test('readGenerator reads both attribute orders and returns empty when absent', () => {
  assert.equal(readGenerator('<meta name="generator" content="Ghost 6.51">'), 'Ghost 6.51');
  assert.equal(readGenerator("<meta content='Ghost 6.51' name='generator'>"), 'Ghost 6.51');
  assert.equal(readGenerator('<meta name="viewport" content="width=device-width">'), '');
  assert.equal(readGenerator(''), '');
});
test('detectPlatform prefers URL detection, then HTML, then falls back to framer', () => {
  assert.equal(detectPlatform('https://acme.webflow.io').name, 'webflow');
  assert.equal(
    detectPlatform('https://custom.example.com/', '<html data-wf-site="x"></html>').name,
    'webflow'
  );
  assert.equal(detectPlatform('https://custom.example.com/').name, 'framer');
  assert.equal(detectPlatform('https://custom.example.com/', '<p>nothing</p>').name, 'framer');
});
test('getPlatformByName resolves known names and falls back to framer', () => {
  assert.equal(getPlatformByName('wix').name, 'wix');
  assert.equal(getPlatformByName('shopify').name, 'shopify');
  assert.equal(getPlatformByName('unknown'), framer);
});
