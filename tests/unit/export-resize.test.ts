import assert from 'node:assert/strict';
import test from 'node:test';
import {
  boxBot,
  boxLine,
  boxRow,
  boxSep,
  boxTop,
  fitAnsi,
  maxWidth,
  panelBot,
  panelLine,
  panelSep,
  panelTop,
} from '../../src/cli/box.js';
import { ExportSidebar } from '../../src/cli/sidebar.js';
import { plainText, textWidth } from '../../src/cli/terminal-screen.js';
import {
  clearLogHistory,
  error,
  getLogHistory,
  info,
  log,
  setCooking,
  setMessageWidth,
  setRenderHook,
  success,
  warn,
} from '../../src/logger/index.js';
import { resetProgress, setPhase } from '../../src/exporter/progress.js';

function terminalMock(columns: number, rows: number, isTTY = true) {
  const descriptors: Array<{ target: object; key: string; descriptor?: PropertyDescriptor }> = [];
  const stdout: string[] = [];
  const stderr: string[] = [];
  const define = (target: object, key: string, value: unknown) => {
    descriptors.push({ target, key, descriptor: Object.getOwnPropertyDescriptor(target, key) });
    Object.defineProperty(target, key, { configurable: true, writable: true, value });
  };
  for (const stream of [process.stdout, process.stderr]) {
    define(stream, 'columns', columns);
    define(stream, 'rows', rows);
    define(stream, 'isTTY', isTTY);
  }
  const capture =
    (output: string[]) => (chunk: string | Uint8Array, encoding?: unknown, callback?: unknown) => {
      output.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      const done = typeof encoding === 'function' ? encoding : callback;
      if (typeof done === 'function') done();
      return true;
    };
  define(process.stdout, 'write', capture(stdout));
  define(process.stderr, 'write', capture(stderr));
  return {
    stdout,
    stderr,
    resize(nextColumns: number, nextRows: number) {
      for (const stream of [process.stdout, process.stderr]) {
        Object.defineProperty(stream, 'columns', {
          configurable: true,
          writable: true,
          value: nextColumns,
        });
        Object.defineProperty(stream, 'rows', {
          configurable: true,
          writable: true,
          value: nextRows,
        });
      }
      process.stdout.emit('resize');
    },
    clear() {
      stdout.length = 0;
      stderr.length = 0;
    },
    restore() {
      for (const { target, key, descriptor } of descriptors.reverse()) {
        if (descriptor) Object.defineProperty(target, key, descriptor);
        else Reflect.deleteProperty(target, key);
      }
    },
  };
}

function assertCursorWritesBounded(chunks: string[], columns: number, rows: number) {
  let positions = 0;
  const output = chunks.join('');
  for (const match of output.matchAll(/\x1b\[(\d+);(\d+)H([\s\S]*?)(?=\x1b\[\d+;\d+H|\x1b8|$)/g)) {
    const row = Number(match[1]);
    const column = Number(match[2]);
    assert.ok(row >= 1 && row <= rows, `cursor row ${row} is outside ${rows}`);
    assert.ok(column >= 1 && column <= columns, `cursor column ${column} is outside ${columns}`);
    assert.ok(
      column + textWidth(match[3]) - 1 <= columns,
      `sidebar row exceeds ${columns} columns`
    );
    positions++;
  }
  return positions;
}

test('export boxes and panels fit narrow terminals without negative dimensions', () => {
  for (const columns of [1, 2, 3, 4, 6, 20, 80, 120]) {
    const terminal = terminalMock(columns, 20);
    try {
      const width = maxWidth();
      assert.ok(width >= 0 && width <= columns);
      const content = '\x1b[36mExport été 界 👩🏽‍💻 e\u0301\x1b[0m';
      const lines = [
        boxTop(width),
        boxLine(width, content),
        boxRow(width, 'Dossier 界', './Export été 界/👩🏽‍💻/very-long-folder-name'),
        boxSep(width),
        boxBot(width),
        panelTop(width),
        panelLine(width, content),
        panelSep(width),
        panelBot(width),
      ];
      for (const line of lines) {
        assert.ok(
          textWidth(line) <= columns,
          `${columns} columns: ${JSON.stringify(plainText(line))}`
        );
        assert.equal(plainText(line).isWellFormed(), true);
      }
    } finally {
      terminal.restore();
    }
  }
});

test('ANSI truncation measures terminal cells and preserves complete graphemes', () => {
  const content = '\x1b[31m👩🏽‍💻e\u0301界 export/very-long-name\x1b[0m';
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const valid = new Set(
    [...segmenter.segment(plainText(content) + '.…')].map((item) => item.segment)
  );
  for (let columns = 0; columns <= 32; columns++) {
    const fitted = fitAnsi(content, columns);
    const plain = plainText(fitted);
    assert.ok(textWidth(fitted) <= columns, `fitted text exceeds ${columns} columns`);
    assert.equal(plain.isWellFormed(), true);
    for (const { segment } of segmenter.segment(plain)) {
      assert.ok(
        valid.has(segment),
        `partial grapheme ${JSON.stringify(segment)} at ${columns} columns`
      );
    }
  }
  assert.equal(plainText(fitAnsi('\x1b[32m界e\u0301\x1b[0m', 3)), '界e\u0301');
});

test('all logger levels fit a TTY while history retains the full messages', () => {
  const message = 'Downloaded 界 👩🏽‍💻 e\u0301 /assets/' + 'long-directory/'.repeat(20);
  for (const columns of [1, 2, 3, 4, 6, 20, 80, 120]) {
    const terminal = terminalMock(columns, 20);
    try {
      clearLogHistory();
      setMessageWidth(null);
      setRenderHook(null);
      setCooking(null);
      for (const output of [log, info, warn, success, error]) output(message);
      assert.deepEqual(
        getLogHistory().map((entry) => entry.message),
        Array(5).fill(message)
      );
      const lines = [...terminal.stdout, ...terminal.stderr]
        .join('')
        .split(/\r?\n/)
        .filter(Boolean);
      assert.equal(lines.length, 5);
      for (const line of lines)
        assert.ok(textWidth(line) <= columns, `logger exceeds ${columns}: ${plainText(line)}`);
    } finally {
      clearLogHistory();
      setMessageWidth(null);
      terminal.restore();
    }
  }
});

test('redirected logger output preserves long messages even with a sidebar width configured', () => {
  const terminal = terminalMock(6, 6, false);
  const message = 'Exported 界 e\u0301 ' + 'full-path/'.repeat(40);
  try {
    clearLogHistory();
    setMessageWidth(4);
    for (const output of [log, info, warn, success, error]) output(message);
    const lines = [...terminal.stdout, ...terminal.stderr].join('').split(/\r?\n/).filter(Boolean);
    assert.equal(lines.length, 5);
    for (const line of lines) assert.ok(plainText(line).includes(message));
    assert.deepEqual(
      getLogHistory().map((entry) => entry.message),
      Array(5).fill(message)
    );
  } finally {
    clearLogHistory();
    setMessageWidth(null);
    terminal.restore();
  }
});

test('export sidebar suspends on short or narrow viewports and redraws when space returns', () => {
  const terminal = terminalMock(120, 30);
  const baselineListeners = process.stdout.listenerCount('resize');
  const sidebar = new ExportSidebar();
  const message = 'x'.repeat(200);
  const loggedWidth = () => {
    terminal.clear();
    log(message);
    const output = terminal.stdout.find((chunk) => plainText(chunk).includes('[log]'));
    assert.ok(output, 'log output is missing');
    return textWidth(output);
  };
  try {
    resetProgress();
    setMessageWidth(null);
    setRenderHook(null);
    const baselineWidth = loggedWidth();
    terminal.clear();
    sidebar.start();
    assert.equal(process.stdout.listenerCount('resize'), baselineListeners + 1);
    assert.ok(assertCursorWritesBounded(terminal.stdout, 120, 30) > 0, 'sidebar did not draw');
    const reservedWidth = loggedWidth();
    assert.ok(reservedWidth < baselineWidth, 'sidebar did not reserve horizontal space');

    terminal.clear();
    terminal.resize(120, 6);
    assertCursorWritesBounded(terminal.stdout, 120, 6);
    terminal.clear();
    setPhase('short viewport');
    assert.equal(terminal.stdout.join(''), '', 'sidebar is still painting in a short viewport');
    assert.equal(
      loggedWidth(),
      baselineWidth,
      'short viewport did not restore the full logger width'
    );

    terminal.clear();
    terminal.resize(40, 20);
    assertCursorWritesBounded(terminal.stdout, 40, 20);
    terminal.clear();
    setPhase('narrow viewport');
    assert.equal(terminal.stdout.join(''), '', 'sidebar is still painting in a narrow viewport');
    assert.ok(loggedWidth() <= 40);

    terminal.clear();
    terminal.resize(120, 30);
    assert.ok(
      assertCursorWritesBounded(terminal.stdout, 120, 30) > 0,
      'sidebar did not return after resizing'
    );
    assert.equal(loggedWidth(), reservedWidth);
    terminal.clear();
    sidebar.stop();
    assertCursorWritesBounded(terminal.stdout, 120, 30);
    assert.equal(process.stdout.listenerCount('resize'), baselineListeners);
    assert.equal(loggedWidth(), baselineWidth);
    terminal.clear();
    terminal.resize(120, 30);
    setPhase('stopped');
    assert.equal(
      terminal.stdout.join(''),
      '',
      'stopped sidebar still reacts to progress or resize'
    );
  } finally {
    sidebar.stop();
    setRenderHook(null);
    setMessageWidth(null);
    clearLogHistory();
    terminal.restore();
  }
});
