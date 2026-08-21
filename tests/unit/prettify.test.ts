import assert from 'node:assert/strict';
import test from 'node:test';
import { prettifyJS } from '../../src/formatter/prettify.js';

test('prettifyJS expands minified statements onto separate lines', async () => {
  const out = await prettifyJS('const a=1;const b=2;function f(x){return x*2}');
  assert.match(out, /const a = 1;\n/);
  assert.match(out, /const b = 2;\n/);
  assert.match(out, /function f\(x\) \{\n {2}return x \* 2;\n\}/);
});

test('prettifyJS uses double quotes and keeps semicolons (configured style)', async () => {
  const out = await prettifyJS("const s='hi'");
  assert.equal(out, 'const s = "hi";\n');
});

test('prettifyJS wraps long argument lists at printWidth 100', async () => {
  const args = Array.from({ length: 12 }, (_, i) => `argumentNumber${i}`).join(',');
  const out = await prettifyJS(`callSomething(${args});`);
  assert.ok(out.includes('\n  argumentNumber0,'), 'arguments should break onto their own lines');
  for (const line of out.split('\n')) {
    assert.ok(line.length <= 100, 'line exceeds printWidth: ' + line);
  }
});

test('prettifyJS returns the source unchanged when parsing fails', async () => {
  const broken = 'function ( { this is not javascript <<<';
  assert.equal(await prettifyJS(broken), broken);
});

test('prettifyJS is idempotent on already-formatted code', async () => {
  const once = await prettifyJS('const value={a:1,b:[1,2,3]};');
  const twice = await prettifyJS(once);
  assert.equal(twice, once);
});
