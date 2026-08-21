import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resetProgress,
  setPhase,
  setTotalAssets,
  noteDownload,
  noteFile,
  noteSubpage,
  getProgress,
  onProgress,
} from '../../src/exporter/progress.js';

test('resetProgress clears all counters and stamps a start time', () => {
  noteDownload(true);
  noteFile('a.css');
  resetProgress();
  const p = getProgress();
  assert.equal(p.downloaded, 0);
  assert.equal(p.failed, 0);
  assert.equal(p.written, 0);
  assert.equal(p.subpages, 0);
  assert.equal(p.totalAssets, 0);
  assert.equal(p.phase, '');
  assert.deepEqual(p.recentFiles, []);
  assert.ok(p.startedAt > 0);
});

test('counters accumulate downloads, failures, files and subpages', () => {
  resetProgress();
  setTotalAssets(10);
  noteDownload(true);
  noteDownload(true);
  noteDownload(false);
  noteFile('styles/main.css');
  noteSubpage();
  const p = getProgress();
  assert.equal(p.totalAssets, 10);
  assert.equal(p.downloaded, 2);
  assert.equal(p.failed, 1);
  assert.equal(p.written, 1);
  assert.equal(p.subpages, 1);
});

test('setPhase updates the phase label', () => {
  resetProgress();
  setPhase('Downloading assets...');
  assert.equal(getProgress().phase, 'Downloading assets...');
});

test('noteFile normalizes backslashes and keeps only the most recent entries', () => {
  resetProgress();
  noteFile('assets\\images\\logo.png');
  assert.deepEqual(getProgress().recentFiles, ['assets/images/logo.png']);
  for (let i = 0; i < 15; i++) noteFile(`file-${i}.js`);
  const files = getProgress().recentFiles;
  assert.equal(files.length, 10);
  assert.equal(files[files.length - 1], 'file-14.js');
  assert.equal(files[0], 'file-5.js');
});

test('onProgress notifies subscribers and supports unsubscribe', () => {
  resetProgress();
  let calls = 0;
  const off = onProgress(() => calls++);
  setPhase('a');
  noteDownload(true);
  assert.equal(calls, 2);
  off();
  setPhase('b');
  assert.equal(calls, 2);
});
