import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetMap } from '../../src/assets/asset-map.js';
import { injectRuntimeCms } from '../../src/exporter/runtime-cms.js';

test('CMS runtime JSON cannot terminate its script through an embedded URL', () => {
  const assets = new AssetMap();
  assets.localPathFor('https://framerusercontent.com/cms/site/record.framercms');
  const output = injectRuntimeCms(
    '<html><head></head><body></body></html>',
    assets,
    'https://source.example/</script><script>window.injected=true</script>'
  );
  assert.equal(output.match(/<script\b/g)?.length, 1);
  assert.equal(output.match(/<\/script>/g)?.length, 1);
  assert.ok(output.includes('\\u003c/script>'));
});
