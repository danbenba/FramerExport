import assert from 'node:assert/strict';
import test from 'node:test';
import xterm from '@xterm/headless';
import {
  fitText,
  paintTerminal,
  plainText,
  TerminalCanvas,
  textWidth,
  wrapText,
} from '../../src/cli/terminal-screen.js';

test('terminal text strips ANSI, OSC links and control characters from user content', () => {
  assert.equal(
    plainText('\x1b[31mRed\x1b[0m\x1b]8;;https://example.com\x07link\x1b]8;;\x07\n\t\x00'),
    'Redlink'
  );
  assert.equal(textWidth('\x1b[32m界é\x1b[0m'), 3);
});

test('text fitting respects display columns and preserves whole grapheme clusters', () => {
  assert.equal(fitText('界界', 3), '界…');
  assert.equal(fitText('界界', 2, false), '界');
  assert.equal(fitText('👨‍👩‍👧‍👦 abc', 3), '👨‍👩‍👧‍👦…');
  assert.equal(fitText('e\u0301cole', 3), 'e\u0301c…');
  assert.equal(fitText('abc', 0), '');
  assert.equal(fitText('abc', 1), '…');
  for (let width = 1; width < 30; width++)
    assert.ok(textWidth(fitText('é界 👩🏽‍💻 café / long/path/name', width)) <= width);
});

test('wrapping constrains long paths, unicode and words to the available width', () => {
  for (const width of [1, 2, 3, 8, 20, 40]) {
    const lines = wrapText(
      'A public page with é and 界 plus /a/very/long/path/that/cannot/fit',
      width
    );
    assert.ok(lines.length > 0);
    for (const line of lines) assert.ok(textWidth(line) <= width, `${width}: ${line}`);
  }
  assert.deepEqual(wrapText('some text', 0), []);
});

test('canvas clips fills, borders and text at every supported terminal dimension', () => {
  for (const [width, height] of [
    [1, 1],
    [20, 6],
    [40, 12],
    [80, 24],
    [120, 40],
  ]) {
    const canvas = new TerminalCanvas(width, height);
    canvas.fill(-4, -2, width + 12, height + 8);
    canvas.box(0, 0, width, height);
    canvas.text(-2, 0, '界界界' + 'x'.repeat(width + 20));
    canvas.text(width - 1, height - 1, '界');
    for (const depth of [1, 4, 8, 24]) {
      const lines = canvas.lines(depth);
      assert.equal(lines.length, height);
      for (const line of lines) assert.equal(textWidth(line), width);
    }
  }
});

test('overwriting a wide glyph or its continuation clears the old glyph without row overflow', () => {
  for (const position of [0, 1]) {
    const canvas = new TerminalCanvas(4, 1);
    canvas.text(0, 0, '界ab');
    canvas.text(position, 0, 'x');
    const line = canvas.lines(1)[0];
    assert.equal(textWidth(line), 4, `replacement at column ${position}: ${line}`);
    assert.equal(line.includes('界'), false);
    assert.ok(line.includes('x'));
  }
});

test('copying clips wide glyphs at both destination edges without stale continuation cells', () => {
  const source = new TerminalCanvas(4, 1);
  source.text(0, 0, '界ab');
  for (const x of [-1, 1, 2, 3]) {
    const target = new TerminalCanvas(4, 1);
    target.copy(source, x, 0, 0, 1);
    assert.equal(textWidth(target.lines(1)[0]), 4, `copy x=${x}`);
  }
});

test('all grayscale icon samples stay within the 256-color palette', () => {
  for (let gray = 0; gray <= 255; gray++) {
    const canvas = new TerminalCanvas(1, 1);
    const color = '#' + gray.toString(16).padStart(2, '0').repeat(3);
    canvas.text(0, 0, '▀', { fg: color, bg: color });
    const matches = [...canvas.lines(8)[0].matchAll(/(?:38|48);5;(\d+)/g)];
    assert.equal(matches.length, 2);
    for (const match of matches)
      assert.ok(
        Number(match[1]) >= 0 && Number(match[1]) <= 255,
        `gray=${gray}, color=${match[1]}`
      );
  }
});

test('painting updates only changed rows and cannot scroll the bottom-right cell', async (t) => {
  const terminal = new xterm.Terminal({ cols: 20, rows: 6, allowProposedApi: true });
  t.after(() => terminal.dispose());
  const write = (value: string) => new Promise<void>((resolve) => terminal.write(value, resolve));
  const canvas = new TerminalCanvas(20, 6);
  canvas.text(0, 0, 'Framer Export');
  canvas.text(0, 5, '12345678901234567890');
  const original = canvas.lines(24);
  await write(paintTerminal(original));
  assert.equal(terminal.buffer.active.baseY, 0);
  assert.equal(
    terminal.buffer.active.getLine(0)?.translateToString(true).trimEnd(),
    'Framer Export'
  );
  assert.equal(terminal.buffer.active.getLine(5)?.translateToString(true), '12345678901234567890');
  canvas.text(0, 2, 'Changed');
  const next = canvas.lines(24);
  const update = paintTerminal(next, original);
  assert.ok(update.includes('\x1b[3;1H'));
  assert.equal(update.includes('\x1b[1;1H'), false);
  await write(update);
  assert.equal(
    terminal.buffer.active.getLine(0)?.translateToString(true).trimEnd(),
    'Framer Export'
  );
  assert.equal(terminal.buffer.active.getLine(2)?.translateToString(true).trimEnd(), 'Changed');
  assert.equal(terminal.buffer.active.baseY, 0);
});
