import assert from 'node:assert/strict';
import test from 'node:test';
import xterm, { type Terminal } from '@xterm/headless';
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

test('ASCII and border fast paths preserve clipped text and wide-glyph boundaries', () => {
  for (const value of ['abcXYZ', ' \u250c\u2500\u2591\u259f ', '', '\x1b[31mred\x1b[0m']) {
    for (const x of [-3, -1, 0, 1, 2, 6, 8]) {
      for (const width of [0, 1, 2, 5, 12]) {
        const fast = new TerminalCanvas(8, 1);
        fast.text(0, 0, '界語界語');
        const general = fast.clone();
        const style = { fg: '#ab1234', bg: '#1234ab', bold: true };
        fast.text(x, 0, value, style, width);
        general.text(x, 0, '\u200b' + value, style, width);
        assert.deepEqual(fast.lines(), general.lines(), JSON.stringify({ value, x, width }));
        assert.deepEqual(fast.diff(general), []);
      }
    }
  }
  for (const value of ['abcXYZ', ' \u250c\u2500\u2591\u259f ']) {
    for (const width of [0, 1, 2, 5, 12]) {
      for (const ellipsis of [false, true])
        assert.equal(
          fitText(value, width, ellipsis),
          fitText('\u200b' + value, width, ellipsis).replaceAll('\u200b', '')
        );
      assert.equal(textWidth(value), textWidth('\u200b' + value));
    }
  }
});

test('fills stay inside their rectangle when the repeated character takes multiple columns', () => {
  const canvas = new TerminalCanvas(8, 2);
  canvas.text(0, 0, 'abcdefgh');
  canvas.text(0, 1, 'abcdefgh');
  canvas.fill(2, 0, 3, 1, {}, '界');
  canvas.fill(-1, 1, 4, 1, {}, '界');
  assert.deepEqual(canvas.lines(1), ['ab界efgh', '界cdefgh']);
});

test('clones and copied decorations stay independent as foreground and background change', () => {
  const original = new TerminalCanvas(8, 2);
  original.decorateBackground(() => ({ text: '·', fg: '#666666' }));
  original.fill(0, 0, 2, 1, { bg: '#121212' });
  const style = { fg: '#abcdef', bg: '#101010', bold: true };
  original.text(3, 0, '界', style);
  const snapshot = original.lines();
  const clone = original.clone();
  const copied = new TerminalCanvas(8, 2);
  copied.copy(original, 0, 0, 0, 2);
  style.fg = '#ff0000';
  assert.deepEqual(original.lines(), snapshot);
  assert.deepEqual(clone.diff(original), []);
  clone.text(3, 0, 'new');
  clone.decorateBackground(() => null);
  assert.deepEqual(original.lines(), snapshot);
  original.text(0, 1, 'change');
  copied.decorateBackground(() => ({ text: ':', fg: '#777777' }));
  assert.deepEqual(copied.lines(1), ['  :界:::', '::::::::']);
  assert.deepEqual(clone.lines(1), ['   new  ', '        ']);
});

test('cell diffs include changed styles and both columns of wide glyphs without unrelated rows', () => {
  const previous = new TerminalCanvas(8, 3);
  previous.text(0, 0, '界ab');
  previous.text(1, 1, 'status', { fg: '#aaaaaa' });
  const next = previous.clone();
  next.text(0, 0, '語ac');
  next.text(1, 1, 'status', { fg: '#aaaaaa', bold: true });
  assert.deepEqual(next.diff(previous), [
    { x: 0, y: 0, columns: 2, rows: 1 },
    { x: 3, y: 0, columns: 1, rows: 1 },
    { x: 1, y: 1, columns: 6, rows: 1 },
  ]);
  const shifted = previous.clone();
  shifted.text(1, 0, '語');
  assert.deepEqual(shifted.diff(previous), [{ x: 0, y: 0, columns: 3, rows: 1 }]);
  assert.deepEqual(next.diff(), [{ x: 0, y: 0, columns: 8, rows: 3 }]);
  assert.deepEqual(next.diff(new TerminalCanvas(4, 1)), next.diff());
});

test('unchanged frames emit no terminal bytes and local edits never clear the screen', () => {
  const canvas = new TerminalCanvas(80, 24);
  canvas.text(2, 2, 'Ready');
  const next = canvas.clone();
  assert.equal(next.paint(next.diff(canvas)), '');
  assert.equal(paintTerminal(canvas.lines(), canvas.lines()), '');
  next.text(2, 2, 'Retry');
  const output = next.paint(next.diff(canvas));
  assert.ok(output.length < 100);
  assert.equal(output.includes('\x1b[2J'), false);
  assert.equal(output.includes('\x1b[1;1H'), false);
});

function terminalSnapshot(terminal: Terminal): unknown[] {
  return Array.from({ length: terminal.rows }, (_, y) =>
    Array.from({ length: terminal.cols }, (_, x) => {
      const cell = terminal.buffer.active.getLine(y)?.getCell(x);
      return (
        cell && [
          cell.getChars(),
          cell.getWidth(),
          cell.getFgColor(),
          cell.getBgColor(),
          cell.isBold(),
        ]
      );
    })
  );
}

test('headless xterm replays wide-glyph and combining-mark diffs exactly at every edge', async (t) => {
  for (const depth of [1, 8, 24]) {
    const terminal = new xterm.Terminal({ cols: 12, rows: 3, allowProposedApi: true });
    const reference = new xterm.Terminal({ cols: 12, rows: 3, allowProposedApi: true });
    t.after(() => {
      terminal.dispose();
      reference.dispose();
    });
    const write = (target: Terminal, value: string) =>
      new Promise<void>((resolve) => target.write(value, resolve));
    let previous: TerminalCanvas | undefined;
    for (const value of ['界ab語e\u0301', '語ac界é', ' ab語e\u0301', 'xy界abc', 'e\u0301界', '']) {
      const next = new TerminalCanvas(12, 3);
      next.text(0, 0, value, { fg: '#ace123', bold: value.startsWith('語') });
      next.text(10, 2, value.includes('界') ? '界' : 'ok', { bg: '#233455' });
      const update = next.paint(next.diff(previous), depth);
      assert.equal(update.includes('\x1b[2J'), false);
      await write(terminal, update);
      await write(reference, next.paint(next.diff(), depth));
      assert.deepEqual(
        terminalSnapshot(terminal),
        terminalSnapshot(reference),
        `${depth}: ${value}`
      );
      assert.equal(terminal.buffer.active.baseY, 0);
      assert.equal(
        terminal.buffer.active.getLine(0)?.translateToString(true).trimEnd(),
        next.lines(1)[0].trimEnd()
      );
      previous = next;
    }
  }
});

test('image repaint rectangles expand to whole graphemes and support canvas offsets', async (t) => {
  const terminal = new xterm.Terminal({ cols: 10, rows: 4, allowProposedApi: true });
  t.after(() => terminal.dispose());
  const canvas = new TerminalCanvas(6, 1);
  canvas.text(1, 0, '界', { fg: '#abcdef', bold: true });
  const output = canvas.paint([{ x: 2, y: 0, columns: 1, rows: 1 }], 24, { x: 2, y: 1 });
  assert.ok(output.includes('\x1b[2;4H'));
  await new Promise<void>((resolve) => terminal.write(output, resolve));
  assert.equal(terminal.buffer.active.getLine(1)?.getCell(3)?.getChars(), '界');
  assert.equal(terminal.buffer.active.getLine(1)?.getCell(3)?.getFgColor(), 0xabcdef);
  assert.equal(terminal.buffer.active.getLine(1)?.getCell(4)?.getWidth(), 0);
  assert.equal(canvas.paint([{ x: 8, y: 0, columns: 2, rows: 1 }]), '');
});

test('emoji edits repaint their row so legacy terminals retain no fragments from prior clusters', async (t) => {
  const terminal = new xterm.Terminal({ cols: 20, rows: 3, allowProposedApi: true });
  t.after(() => terminal.dispose());
  const write = (target: Terminal, value: string) =>
    new Promise<void>((resolve) => target.write(value, resolve));
  let previous: TerminalCanvas | undefined;
  for (const value of [
    '👨‍👩‍👧‍👦 file',
    '👩🏽‍💻 file',
    '👩🏽‍💻 path',
    '❤️ path',
    '🇫🇷 done',
    '1️⃣ done',
    'all done',
  ]) {
    const next = new TerminalCanvas(20, 3);
    next.text(1, 1, value, { fg: '#12cdef', bold: value.endsWith('path') });
    const rects = next.diff(previous);
    if (previous) assert.deepEqual(rects, [{ x: 0, y: 1, columns: 20, rows: 1 }]);
    const update = next.paint(rects);
    assert.equal(update.includes('\x1b[2J'), false);
    await write(terminal, update);
    const reference = new xterm.Terminal({ cols: 20, rows: 3, allowProposedApi: true });
    await write(reference, next.paint(next.diff()));
    assert.deepEqual(terminalSnapshot(terminal), terminalSnapshot(reference), value);
    reference.dispose();
    assert.equal(next.paint(next.diff(next.clone())), '');
    previous = next;
  }
});

test('resizing repaints the new viewport without scrollback or screen clears', async (t) => {
  const terminal = new xterm.Terminal({ cols: 20, rows: 6, allowProposedApi: true });
  t.after(() => terminal.dispose());
  const write = (value: string) => new Promise<void>((resolve) => terminal.write(value, resolve));
  await write('\x1b[?1049h');
  let previous: TerminalCanvas | undefined;
  for (const [width, height] of [
    [20, 6],
    [40, 12],
    [8, 3],
    [1, 1],
    [80, 24],
  ]) {
    terminal.resize(width, height);
    const next = new TerminalCanvas(width, height);
    next.text(0, 0, 'framerexport');
    next.fill(0, height - 1, width, 1, { fg: '#ff1234' }, '-');
    const update = next.paint(next.diff(previous));
    assert.equal(update.includes('\x1b[2J'), false);
    await write(update);
    for (let y = 0; y < height; y++)
      assert.equal(
        terminal.buffer.active.getLine(y)?.translateToString(true, 0, width).trimEnd(),
        next.lines(1)[y].trimEnd()
      );
    assert.equal(terminal.buffer.active.baseY, 0);
    previous = next;
  }
});
