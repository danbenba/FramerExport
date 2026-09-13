import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { type ChildProcess, type spawn } from 'node:child_process';
import test from 'node:test';
import { CompanionUi } from '../../src/cli/companion-ui.js';

function childFixture() {
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: { end() {} },
    exitCode: null as number | null,
    killed: false,
    killCalls: 0,
    kill() {
      this.killed = true;
      this.killCalls++;
      return true;
    },
  });
  return child;
}

function companionFixture() {
  const children: ReturnType<typeof childFixture>[] = [];
  const companion = new CompanionUi((() => {
    const child = childFixture();
    children.push(child);
    return child as unknown as ChildProcess;
  }) as typeof spawn);
  return { children, companion };
}

test('stopping a pending companion rejects promptly and stale child events cannot stop its replacement', async (t) => {
  const { children, companion } = companionFixture();
  t.after(() => companion.stop());
  const first = companion.start();
  const stopped = assert.rejects(first, /stopped before it was ready/);
  companion.stop();
  await stopped;
  const second = companion.start();
  assert.equal(children.length, 2);
  children[0].stdout.emit('data', 'http://localhost:1234');
  children[0].emit('error', new Error('old process failure'));
  children[0].exitCode = 1;
  children[0].emit('exit', 1);
  assert.equal(children[1].killCalls, 0);
  assert.equal(companion.start(), second);
  children[1].stdout.emit('data', 'http://localhost:5678');
  assert.equal(await second, 'http://localhost:5678');
  assert.equal(await companion.start(), 'http://localhost:5678');
  assert.equal(children.length, 2);
  companion.stop();
  assert.equal(children[0].killCalls, 1);
  assert.equal(children[1].killCalls, 1);
});

test('a ready companion exiting after restart cannot clear the new address or spawn a third child', async (t) => {
  const { children, companion } = companionFixture();
  t.after(() => companion.stop());
  const first = companion.start();
  children[0].stdout.emit('data', 'http://localhost:1234');
  assert.equal(await first, 'http://localhost:1234');
  companion.stop();
  const second = companion.start();
  children[1].stdout.emit('data', 'http://localhost:5678');
  assert.equal(await second, 'http://localhost:5678');
  children[0].exitCode = 0;
  children[0].emit('exit', 0);
  assert.equal(await companion.start(), 'http://localhost:5678');
  assert.equal(children.length, 2);
  assert.equal(children[1].killCalls, 0);
});

test('a failed companion can be retried while the failed process finishes exiting', async (t) => {
  const { children, companion } = companionFixture();
  t.after(() => companion.stop());
  const first = companion.start();
  const failed = assert.rejects(first, /launch failed/);
  children[0].emit('error', new Error('launch failed'));
  await failed;
  const second = companion.start();
  children[0].emit('exit', 1);
  children[1].stdout.emit('data', 'http://localhost:5678');
  assert.equal(await second, 'http://localhost:5678');
  assert.equal(children[1].killCalls, 0);
});
