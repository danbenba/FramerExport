import assert from 'node:assert/strict';
import test from 'node:test';
import { CFG } from '../../src/config/index.js';
test('CFG exposes a sane desktop viewport', () => {
  assert.equal(CFG.viewport.width, 1440);
  assert.equal(CFG.viewport.height, 900);
  assert.equal(CFG.viewport.deviceScaleFactor, 1);
});
test('CFG timeouts and retry counts are positive and ordered', () => {
  assert.ok(CFG.timeout > 0);
  assert.ok(CFG.dlTimeout > 0);
  assert.ok(
    CFG.dlTimeout <= CFG.timeout,
    'per-download timeout should not exceed the page timeout'
  );
  assert.ok(Number.isInteger(CFG.retries) && CFG.retries >= 1);
});
test('CFG download concurrency is a positive integer', () => {
  assert.ok(Number.isInteger(CFG.concurrency));
  assert.ok(CFG.concurrency >= 1);
});
test('CFG scroll settings drive lazy-loading without being zero', () => {
  assert.ok(CFG.scrollStep > 0);
  assert.ok(CFG.scrollDelay > 0);
});
test('CFG strips common tracker domains on every platform', () => {
  for (const domain of ['sentry.io', 'google-analytics.com', 'connect.facebook.net']) {
    assert.ok(CFG.sharedStripDomains.includes(domain), domain);
  }
  for (const entry of CFG.sharedStripDomains) {
    assert.doesNotMatch(entry, /^https?:\/\//);
    assert.doesNotMatch(entry, /\//);
  }
});
