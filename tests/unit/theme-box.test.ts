import assert from 'node:assert/strict';
import test from 'node:test';
import { stripAnsi, centerText, truncatePlain, chip } from '../../src/cli/theme.js';
import { fitAnsi, shortenPath, maxWidth } from '../../src/cli/box.js';
const RED = '\x1B[31m';
const BOLD = '\x1B[1m';
const RESET = '\x1B[0m';
test('stripAnsi removes CSI escape sequences and leaves plain text alone', () => {
  assert.equal(stripAnsi(`${RED}hello${RESET}`), 'hello');
  assert.equal(stripAnsi(`${BOLD}${RED}a${RESET}b`), 'ab');
  assert.equal(stripAnsi('no escapes'), 'no escapes');
  assert.equal(stripAnsi(''), '');
});
test('centerText pads based on visible length, ignoring ANSI codes', () => {
  assert.equal(centerText('ab', 6), '  ab  ');
  assert.equal(centerText('abc', 6), ' abc  ');
  const colored = `${RED}ab${RESET}`;
  const centered = centerText(colored, 6);
  assert.equal(stripAnsi(centered), '  ab  ');
  assert.equal(centered.length, 6 + RED.length + RESET.length);
});
test('centerText returns the text untouched when it already fills the width', () => {
  assert.equal(centerText('abcdef', 6), 'abcdef');
  assert.equal(centerText('too wide', 3), 'too wide');
});
test('truncatePlain keeps short text and clips long text with two dots', () => {
  assert.equal(truncatePlain('short', 10), 'short');
  assert.equal(truncatePlain('exactly-10', 10), 'exactly-10');
  assert.equal(truncatePlain('0123456789A', 10), '01234567..');
  assert.equal(truncatePlain('0123456789A', 10).length, 10);
});
test('chip renders [label] once colors are stripped', () => {
  assert.equal(stripAnsi(chip('mirror')), '[mirror]');
});
test('maxWidth is capped at 76 columns', () => {
  const w = maxWidth();
  assert.ok(w <= 76);
  assert.ok(w > 0);
});
test('fitAnsi leaves strings that already fit unchanged', () => {
  assert.equal(fitAnsi('short', 10), 'short');
  const colored = `${RED}short${RESET}`;
  assert.equal(fitAnsi(colored, 10), colored);
});
test('fitAnsi truncates by visible width and always re-resets styling', () => {
  const colored = `${RED}0123456789${RESET}`;
  const fitted = fitAnsi(colored, 6);
  assert.equal(stripAnsi(fitted), '0123..');
  assert.ok(fitted.endsWith('..' + RESET), 'must reset styles after truncating');
  assert.ok(fitted.startsWith(RED));
});
test('fitAnsi visible output never exceeds the requested width', () => {
  const samples = ['plain-text-that-is-long', `${BOLD}${RED}styled and long text${RESET}`, 'ab'];
  for (const sample of samples) {
    for (const width of [3, 5, 8, 12, 40]) {
      const visible = stripAnsi(fitAnsi(sample, width)).length;
      assert.ok(visible <= width, `visible ${visible} > width ${width} for ${sample}`);
    }
  }
});
test('fitAnsi degrades to dots at unusably small widths', () => {
  assert.equal(fitAnsi('anything long', 2), '..');
  assert.equal(fitAnsi('anything long', 1), '.');
  assert.equal(fitAnsi('anything long', 0), '');
});
test('shortenPath keeps the last segment and the drive letter', () => {
  const input = 'C:\\Users\\danbenba\\Documents\\Framer Export\\index.html';
  const out = shortenPath(input, 40);
  assert.ok(out.length <= 40);
  assert.ok(out.endsWith('index.html'), out);
  assert.ok(out.startsWith('C:'), out);
});
test('shortenPath abbreviates middle segments to three chars plus dots', () => {
  const out = shortenPath('/very-long-directory/another-long-one/file.txt', 30);
  assert.equal(out, '/ver../ano../file.txt');
});
test('shortenPath keeps short segments intact', () => {
  assert.equal(shortenPath('/ab/cd/file.txt', 30), '/ab/cd/file.txt');
});
test('shortenPath falls back to plain truncation at narrow widths', () => {
  const out = shortenPath('/some/deep/path/file.txt', 12);
  assert.equal(out, '/some/deep..');
  assert.equal(out.length, 12);
  assert.equal(shortenPath('/some/deep/path', 3), '...');
});
test('shortenPath output never exceeds the requested width', () => {
  const paths = [
    'C:\\Users\\danbenba\\AppData\\Local\\Temp\\claude\\scratchpad\\deeply\\nested\\file-name.html',
    '/usr/local/share/applications/some-application/resources/asset.bin',
  ];
  for (const p of paths) {
    for (const width of [13, 16, 20, 24, 32, 48, 64]) {
      const out = shortenPath(p, width);
      assert.ok(out.length <= width, `${out.length} > ${width} for ${p}`);
    }
  }
});
