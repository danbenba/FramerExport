import assert from 'node:assert/strict';
import test from 'node:test';
import { LogViewerModel, formatLogRecords, runWithLogViewer } from '../../src/cli/log-viewer.js';
import { plainText, textWidth } from '../../src/cli/terminal-screen.js';
import { THEME } from '../../src/cli/theme.js';
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

test('live filtering keeps all 5000+ records and only searches newly appended messages', () => {
  const model = new LogViewerModel(
    Array.from(
      { length: 5005 },
      (_, index): LogRecord => ({
        time: '10:20:01',
        level: index % 17 === 0 ? 'error' : 'info',
        message: `Asset ${index} ${index % 17 === 0 ? 'font' : 'image'}`,
      })
    )
  );
  let reads = 0;
  for (const record of model.records) {
    const message = record.message;
    Object.defineProperty(record, 'message', {
      get() {
        reads++;
        return message;
      },
    });
  }
  model.query = 'FONT';
  model.filter = 'errors';
  assert.equal(model.filtered().length, 295);
  const initialReads = reads;
  assert.equal(model.filtered().length, 295);
  assert.equal(reads, initialReads);
  model.append({ time: '10:20:02', level: 'error', message: 'New font failure' });
  model.append({ time: '10:20:02', level: 'info', message: 'New font ready' });
  const matched = model.filtered();
  assert.equal(reads, initialReads);
  assert.equal(matched.length, 296);
  assert.equal(matched.at(-1)?.line, 5006);
  const following = model.render(100, 30);
  assert.equal(model.scroll, following.maximumScroll);
  model.filter = 'all';
  assert.equal(model.filtered().length, 297);
  model.query = 'New';
  assert.deepEqual(
    model.filtered().map(({ line }) => line),
    [5006, 5007]
  );
  model.query = '';
  assert.equal(model.filtered().length, 5007);
  assert.equal(model.records.length, 5007);
});

test('mouse wheel pauses following until the visible Latest logs control is clicked', () => {
  const model = new LogViewerModel(
    Array.from({ length: 90 }, (_, index) => ({ ...records[0], message: `Entry ${index}` }))
  );
  model.render(100, 30);
  model.handle({ type: 'mouse', kind: 'wheel-up', x: 40, y: 15 });
  const paused = model.scroll;
  const layout = model.render(100, 30);
  assert.equal(model.follow, false);
  assert.match(layout.canvas.lines(1).join('\n'), /Latest logs/);
  for (let index = 0; index < 30; index++) model.append(records[2]);
  model.render(100, 30);
  assert.equal(model.scroll, paused);
  const resume = layout.regions.find(({ id }) => id === 'follow')!;
  model.handle({ type: 'mouse', kind: 'click', x: resume.x + 1, y: resume.y + 1 });
  const following = model.render(100, 30);
  assert.equal(model.follow, true);
  assert.equal(model.scroll, following.maximumScroll);
  assert.match(following.canvas.lines(1).join('\n'), /Following/);
});

test('phase shine follows a two-second cycle and only changes the phase row', () => {
  const model = new LogViewerModel(records, { reduceMotion: false });
  model.progress = { ...model.progress, phase: 'Downloading export files' };
  const initial = model.phaseCanvas(100, 0);
  const shine = model.phaseCanvas(100, 1000);
  assert.notEqual(initial.lines(24)[0], shine.lines(24)[0]);
  assert.equal(plainText(initial.lines(24)[0]), plainText(shine.lines(24)[0]));
  assert.deepEqual(initial.lines(24), model.phaseCanvas(100, 2000).lines(24));
  assert.match(initial.lines(24)[0], /38;2;181;181;181/);
  assert.match(shine.lines(24)[0], /38;2;255;255;255/);
  model.animationTime = 0;
  const before = model.render(100, 30).canvas;
  model.animationTime = 1000;
  const after = model.render(100, 30).canvas;
  const changes = after.diff(before);
  assert.ok(changes.length > 0);
  assert.ok(changes.every(({ y, rows }) => y === 1 && rows === 1));
  assert.doesNotMatch(after.paint(changes), /\x1b\[(?:2J|3J|\?1049h)/);
});

test('reduced motion and finished exports have no animated text', () => {
  const model = new LogViewerModel(records, { reduceMotion: true });
  assert.deepEqual(model.phaseCanvas(100, 0).lines(), model.phaseCanvas(100, 1000).lines());
  const animated = new LogViewerModel(records, { reduceMotion: false });
  animated.complete = true;
  assert.deepEqual(animated.phaseCanvas(100, 0).lines(), animated.phaseCanvas(100, 1000).lines());
  assert.match(animated.phaseCanvas(100).lines(1)[0], /Export finished/);
  animated.failure = 'Network unavailable';
  assert.match(animated.phaseCanvas(100).lines(1)[0], /Network unavailable/);
  assert.deepEqual(animated.phaseCanvas(100, 0).lines(), animated.phaseCanvas(100, 1000).lines());
});

test('log levels retain distinct colors and the editor separates controls from its records', () => {
  const model = new LogViewerModel(records, { reduceMotion: true });
  const layout = model.render(100, 30);
  const lines = layout.canvas.lines(24);
  const colors = [THEME.secondary, THEME.info, THEME.warning, THEME.error, THEME.success];
  colors.forEach((color, index) => {
    const channels = [1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16));
    assert.ok(lines[layout.bodyTop + index].includes('38;2;' + channels.join(';')));
  });
  assert.equal(plainText(lines[layout.bodyTop - 1]).trim(), '');
  const controls = layout.regions.filter(({ id }) =>
    ['search', 'filter', 'follow', 'copy'].includes(id)
  );
  for (let index = 1; index < controls.length; index++) {
    assert.ok(controls[index].x >= controls[index - 1].x + controls[index - 1].width + 2);
  }
});

test('ASCII and grapheme messages pan in terminal cells without altering the stored records', () => {
  const model = new LogViewerModel([
    { ...records[0], message: '0123456789abcdefghijklmnopqrstuvwxyz' },
    { ...records[1], message: '1234567界👩🏽‍💻e\u0301 tail' },
  ]);
  model.horizontal = 8;
  const layout = model.render(100, 30);
  const lines = layout.canvas.lines(1);
  assert.match(lines[layout.bodyTop], /89abcdefghijklmnopqrstuvwxyz/);
  assert.match(lines[layout.bodyTop + 1], /👩🏽‍💻e\u0301 tail/);
  assert.doesNotMatch(lines[layout.bodyTop + 1], /界/);
  assert.equal(model.records[1].message, '1234567界👩🏽‍💻e\u0301 tail');
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
