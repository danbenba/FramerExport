import assert from 'node:assert/strict';
import test from 'node:test';
import { assessViewport, type ValidationPage } from '../../scripts/validation-result.js';

function pages(): ValidationPage[] {
  return ['source', 'export'].map((kind) => ({
    kind,
    status: 200,
    metrics: { bodyTextLength: 100, brokenImages: [] },
    failed: [],
    external: [],
    errors: [],
    networkFailures: [],
  }));
}

test('visual gate requires both viewport and full-page fidelity', () => {
  assert.equal(assessViewport(0, 0, pages()).passed, true);
  assert.equal(assessViewport(0.006, 0, pages()).passed, false);
  assert.equal(assessViewport(0, 0.006, pages()).passed, false);
  assert.equal(assessViewport(0, 1, pages()).passed, false, 'a dimension mismatch must fail');
  assert.equal(assessViewport(Number.NaN, 0, pages()).passed, false);
});

test('identical pixels do not hide broken requests, external dependencies or runtime errors', () => {
  for (const field of ['failed', 'external', 'errors', 'networkFailures'] as const) {
    const captures = pages();
    if (field === 'external')
      captures[1].external.push({ type: 'image', url: 'https://example.com/image.png' });
    else captures[1][field].push('failed');
    assert.equal(assessViewport(0, 0, captures).passed, false, field);
  }
  const captures = pages();
  captures[1].metrics.brokenImages.push('/missing.png');
  assert.equal(assessViewport(0, 0, captures).passed, false);
});

test('missing captures and empty or failed source pages cannot be certified', () => {
  assert.equal(assessViewport(0, 0, []).passed, false);
  const captures = pages();
  captures[0].status = 403;
  assert.equal(assessViewport(0, 0, captures).passed, false);
  captures[0].status = 200;
  captures[0].metrics.bodyTextLength = 0;
  assert.equal(assessViewport(0, 0, captures).passed, false);
});

test('a resource readiness timeout prevents certification even when measured pixels match', () => {
  for (const index of [0, 1]) {
    const captures = pages();
    captures[index].readinessFailures = ['Images did not finish decoding within 10 seconds'];
    assert.equal(assessViewport(0, 0, captures).passed, false);
  }
});
