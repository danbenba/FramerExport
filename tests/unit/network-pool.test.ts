import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { pool } from '../../src/network/pool.js';
test('pool runs every task exactly once and resolves', async () => {
  const done: number[] = [];
  const tasks = Array.from({ length: 10 }, (_, i) => async () => {
    await sleep(1);
    done.push(i);
  });
  await pool(tasks, 3);
  assert.equal(done.length, 10);
  assert.deepEqual(
    [...done].sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  );
});
test('pool never exceeds the concurrency limit', async () => {
  let active = 0;
  let peak = 0;
  const tasks = Array.from({ length: 12 }, () => async () => {
    active++;
    peak = Math.max(peak, active);
    await sleep(5);
    active--;
  });
  await pool(tasks, 4);
  assert.ok(peak <= 4, `peak concurrency ${peak} exceeded limit 4`);
  assert.ok(peak >= 2, 'tasks should actually overlap');
});
test('pool caps its workers at the task count', async () => {
  let active = 0;
  let peak = 0;
  const tasks = Array.from({ length: 2 }, () => async () => {
    active++;
    peak = Math.max(peak, active);
    await sleep(5);
    active--;
  });
  await pool(tasks, 50);
  assert.equal(peak, 2);
});
test('pool with an empty task list resolves immediately', async () => {
  await pool([], 8);
});
test('pool starts tasks in submission order', async () => {
  const started: number[] = [];
  const tasks = Array.from({ length: 6 }, (_, i) => async () => {
    started.push(i);
    await sleep(1);
  });
  await pool(tasks, 2);
  assert.deepEqual(started, [0, 1, 2, 3, 4, 5]);
});
test('pool rejects when a task rejects, after in-flight tasks settle', async () => {
  const done: number[] = [];
  const tasks = [
    async () => {
      await sleep(1);
      done.push(0);
    },
    async () => {
      await sleep(1);
      throw new Error('download failed');
    },
    async () => {
      await sleep(1);
      done.push(2);
    },
  ];
  await assert.rejects(pool(tasks, 2), /download failed/);
  assert.ok(done.includes(0));
});
