import assert from 'node:assert/strict';
import test from 'node:test';
import {
  log,
  info,
  warn,
  success,
  error,
  onLog,
  getLogHistory,
  clearLogHistory,
} from '../../src/logger/index.js';
import type { LogRecord } from '../../src/logger/index.js';
import { stripAnsi } from '../../src/cli/theme.js';
function captureConsole(t: { after(fn: () => void): void }): string[] {
  const lines: string[] = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  const capture = (...args: unknown[]) => {
    lines.push(stripAnsi(args.map(String).join(' ')));
  };
  console.log = capture;
  console.warn = capture;
  console.error = capture;
  t.after(() => Object.assign(console, orig));
  return lines;
}
test('each helper records its level and console channel', (t) => {
  const lines = captureConsole(t);
  clearLogHistory();
  log('plain message');
  info('info message');
  warn('warn message');
  success('ok message');
  error('error message');
  const levels = getLogHistory().map((r) => r.level);
  assert.deepEqual(levels, ['log', 'info', 'warn', 'ok', 'error']);
  assert.equal(lines.length, 5);
  assert.match(lines[0], /\[log\] plain message$/);
  assert.match(lines[1], /\[info\] info message$/);
  assert.match(lines[2], /\[warn\] warn message$/);
  assert.match(lines[3], /\[ok\] ok message$/);
  assert.match(lines[4], /\[error\] error message$/);
});
test('history keeps full messages, oldest first, with HH:MM:SS timestamps', (t) => {
  captureConsole(t);
  clearLogHistory();
  const long = 'x'.repeat(300);
  log('first');
  log('second');
  log(long);
  const history = getLogHistory();
  assert.deepEqual(
    history.map((r) => r.message),
    ['first', 'second', long]
  );
  assert.equal(history[2].message.length, 300);
  for (const record of history) {
    assert.match(record.time, /^\d{2}:\d{2}:\d{2}$/);
  }
});
test('console output truncates messages to 120 visible chars', (t) => {
  const lines = captureConsole(t);
  clearLogHistory();
  log('a'.repeat(300));
  assert.ok(lines[0].includes('a'.repeat(118) + '..'));
  assert.ok(!lines[0].includes('a'.repeat(119)));
  log('short one');
  assert.ok(lines[1].endsWith('short one'));
});
test('clearLogHistory empties the history in place', (t) => {
  captureConsole(t);
  clearLogHistory();
  log('to be cleared');
  assert.equal(getLogHistory().length, 1);
  const ref = getLogHistory();
  clearLogHistory();
  assert.equal(getLogHistory().length, 0);
  assert.equal(ref.length, 0);
});
test('onLog delivers every record to subscribers until unsubscribed', (t) => {
  captureConsole(t);
  clearLogHistory();
  const seen: LogRecord[] = [];
  const unsubscribe = onLog((record) => seen.push(record));
  log('one');
  warn('two');
  assert.deepEqual(
    seen.map((r) => [r.level, r.message]),
    [
      ['log', 'one'],
      ['warn', 'two'],
    ]
  );
  const long = 'y'.repeat(200);
  error(long);
  assert.equal(seen[2].message, long);
  unsubscribe();
  log('three');
  assert.equal(seen.length, 3);
});
test('multiple subscribers each receive the record exactly once', (t) => {
  captureConsole(t);
  clearLogHistory();
  const a: string[] = [];
  const b: string[] = [];
  const offA = onLog((r) => a.push(r.message));
  const offB = onLog((r) => b.push(r.message));
  t.after(() => {
    offA();
    offB();
  });
  success('broadcast');
  assert.deepEqual(a, ['broadcast']);
  assert.deepEqual(b, ['broadcast']);
});
