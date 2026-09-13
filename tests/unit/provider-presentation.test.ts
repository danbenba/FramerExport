import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import test from 'node:test';
import { PLATFORM_REGISTRY } from '../../src/platforms/registry.js';
import { PROVIDER_PRESENTATION, providerPresentation } from '../../src/platforms/presentation.js';

test('every supported provider has a complete offline web and terminal identity', () => {
  assert.deepEqual(
    Object.keys(PROVIDER_PRESENTATION).sort(),
    ['auto', ...PLATFORM_REGISTRY.map((provider) => provider.name)].sort()
  );
  for (const presentation of Object.values(PROVIDER_PRESENTATION)) {
    assert.ok(presentation.name.length > 1);
    assert.ok(presentation.description.length > 10);
    assert.match(presentation.color, /^#[0-9a-f]{6}$/i);
    assert.match(presentation.iconDataUri, /^data:image\/png;base64,/);
    const png = Buffer.from(presentation.iconDataUri.split(',')[1], 'base64');
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(png.readUInt32BE(16), 256);
    assert.equal(png.readUInt32BE(20), 256);
    const nativePixels = inflateSync(Buffer.from(presentation.iconRgba.deflateBase64, 'base64'));
    assert.equal(nativePixels.length, 256 * 256 * 4);
    assert.ok(nativePixels.some((value, index) => index % 4 === 3 && value > 0));
    const pixels = Buffer.from(presentation.iconPixels.rgbaBase64, 'base64');
    assert.equal(pixels.length, 16 * 16 * 4);
    assert.ok(pixels.some((value, index) => index % 4 === 3 && value > 0));
  }
});

test('unknown, empty and prototype-named providers safely use auto-detect', () => {
  for (const id of ['unknown', '', '__proto__', 'constructor', 'toString']) {
    assert.equal(providerPresentation(id), PROVIDER_PRESENTATION.auto);
  }
  assert.equal(providerPresentation('framer'), PROVIDER_PRESENTATION.framer);
});

test('bundled provider originals match their recorded source hashes', () => {
  const root = new URL('../../assets/provider-icons/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.providers.length, PLATFORM_REGISTRY.length);
  for (const source of manifest.providers) {
    assert.match(source.iconUrl, /^https:\/\//);
    assert.ok(source.license);
    const original = readFileSync(new URL(`${source.id}.${source.format}`, root));
    assert.equal(createHash('sha256').update(original).digest('hex'), source.sha256);
    if (source.format === 'png') {
      assert.ok(original.readUInt32BE(16) >= 128, source.id + ': original width is too small');
      assert.ok(original.readUInt32BE(20) >= 128, source.id + ': original height is too small');
    }
  }
});
