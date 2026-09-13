import assert from 'node:assert/strict';
import test from 'node:test';
import { LogViewerModel, formatLogRecords, runWithLogViewer } from '../../src/cli/log-viewer.js';
import { textWidth } from '../../src/cli/terminal-screen.js';
import {
  clearLogHistory,
  getLogHistory,
  log,
  onLog,
  retainLogHistory,
  suspendConsoleOutput,
  type LogRecord,
} from '../../src/logger/index.js';

const records: LogRecord[] = [
  { time: '10:20:01', level: 'log', message: 'Preparing export' },
  { time: '10:20:02', level: 'info', message: 'Downloading café 界 👩🏽‍💻 e\u0301.css' },
  { time: '10:20:03', level: 'warn', message: 'Missing image, retry scheduled' },
  { time: '10:20:04', level: 'error', message: 'Font download failed' },
  { time: '10:20:05', level: 'ok', message: 'Export complete' },
];

test('viewer preserves every log level, original line numbers and full copyable Unicode messages', () => {
  const model = new LogViewerModel(records);
  assert.equal(model.filtered().length, 5);
  model.activate('filter');
  assert.deepEqual(
    model.filtered().map(({ line }) => line),
    [3, 4]
  );
  model.activate('filter');
  assert.deepEqual(
    model.filtered().map(({ line }) => line),
    [4]
  );
  model.activate('filter');
  assert.equal(model.filtered().length, 5);
  assert.match(
    formatLogRecords(model.records),
    /\[10:20:02\] \[info\] Downloading café 界 👩🏽‍💻 e\u0301.css/
  );
  assert.match(formatLogRecords(model.records), /\[warn\] Missing image/);
  assert.equal(model.records[1].message, records[1].message);
});

test('paused scroll position remains stable while new logs arrive and End resumes following', () => {
  const model = new LogViewerModel(
    Array.from({ length: 60 }, (_, index) => ({ ...records[0], message: `Entry ${index}` }))
  );
  const initial = model.render(100, 24);
  assert.equal(model.scroll, initial.maximumScroll);
  model.handle({ type: 'key', name: 'page-up' });
  const paused = model.scroll;
  assert.equal(model.follow, false);
  model.append(records[2]);
  model.render(100, 24);
  assert.equal(model.scroll, paused);
  model.handle({ type: 'key', name: 'end' });
  const followed = model.render(100, 24);
  assert.equal(model.follow, true);
  assert.equal(model.scroll, followed.maximumScroll);
});

test('search accepts pasted text, supports grapheme deletion and combines with level filters', () => {
  const model = new LogViewerModel(records);
  model.render(80, 24);
  model.handle({ type: 'char', char: '/' });
  model.handle({ type: 'paste', text: '👩🏽‍💻' });
  assert.deepEqual(
    model.filtered().map(({ line }) => line),
    [2]
  );
  model.handle({ type: 'key', name: 'backspace' });
  assert.equal(model.query, '');
  model.handle({ type: 'paste', text: 'DOWNLOAD' });
  model.handle({ type: 'key', name: 'return' });
  assert.equal(model.searching, false);
  model.activate('filter');
  assert.deepEqual(
    model.filtered().map(({ line }) => line),
    [4]
  );
  assert.equal(model.records.length, records.length);
});

test('viewer layouts remain bounded from one cell to large terminals with long messages', () => {
  const model = new LogViewerModel(
    records.map((record) => ({ ...record, message: record.message.repeat(20) }))
  );
  for (const [columns, rows] of [
    [1, 1],
    [2, 3],
    [20, 6],
    [40, 12],
    [80, 24],
    [120, 40],
  ]) {
    const layout = model.render(columns, rows);
    const lines = layout.canvas.lines(1);
    assert.equal(lines.length, rows);
    for (const line of lines) {
      assert.ok(textWidth(line) <= columns);
      assert.equal(line.isWellFormed(), true);
    }
    assert.ok(layout.bodyTop + layout.bodyHeight <= rows);
  }
});

test('mouse scrollbar dragging is bounded and horizontal panning leaves stored messages intact', () => {
  const model = new LogViewerModel(Array.from({ length: 100 }, () => ({ ...records[1] })));
  let layout = model.render(80, 24);
  model.handle({ type: 'mouse', kind: 'press', x: 80, y: layout.bodyTop + 1 });
  assert.equal(model.scroll, 0);
  assert.equal(model.follow, false);
  model.handle({ type: 'mouse', kind: 'move', x: 80, y: 999 });
  layout = model.render(80, 24);
  assert.equal(model.scroll, layout.maximumScroll);
  model.handle({ type: 'mouse', kind: 'click', x: 80, y: 999 });
  model.handle({ type: 'key', name: 'right' });
  assert.equal(model.horizontal, 8);
  assert.equal(model.records[0].message, records[1].message);
  model.handle({ type: 'key', name: 'left' });
  model.handle({ type: 'key', name: 'left' });
  assert.equal(model.horizontal, 0);
});

test('Enter only closes a completed viewer and Esc returns a detach action without claiming completion', () => {
  const model = new LogViewerModel(records);
  model.render(80, 24);
  assert.equal(model.handle({ type: 'key', name: 'return' }), undefined);
  assert.equal(model.handle({ type: 'key', name: 'escape' }), 'close');
  assert.equal(model.complete, false);
  model.complete = true;
  assert.equal(model.handle({ type: 'key', name: 'return' }), 'close');
});

test('scoped console suppression preserves listeners and complete export history beyond 5000 entries', (t) => {
  const original = console.log;
  const printed: unknown[][] = [];
  console.log = (...args) => printed.push(args);
  clearLogHistory();
  const restore = suspendConsoleOutput();
  const release = retainLogHistory();
  let received = 0;
  const unsubscribe = onLog(() => {
    received++;
  });
  t.after(() => {
    restore();
    release();
    unsubscribe();
    console.log = original;
    clearLogHistory();
  });
  for (let index = 0; index < 5005; index++) log(`Entry ${index}`);
  assert.equal(printed.length, 0);
  assert.equal(received, 5005);
  assert.equal(getLogHistory().length, 5005);
  assert.equal(getLogHistory()[0].message, 'Entry 0');
  restore();
  restore();
  log('visible after restore');
  assert.equal(printed.length, 1);
  release();
  release();
  assert.equal(getLogHistory().length, 5006);
  assert.equal(getLogHistory()[0].message, 'Entry 0');
  log('next ordinary operation');
  assert.equal(getLogHistory().length, 5000);
  assert.equal(getLogHistory().at(-1)?.message, 'next ordinary operation');
});

test('non-interactive runner preserves operation results and failures without opening a viewer', async () => {
  if (process.stdin.isTTY && process.stdout.isTTY) return;
  assert.equal(await runWithLogViewer(async () => 42), 42);
  const failure = new Error('export failed');
  await assert.rejects(
    runWithLogViewer(async () => {
      throw failure;
    }),
    (error) => error === failure
  );
});
