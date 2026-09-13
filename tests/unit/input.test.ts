import assert from 'node:assert/strict';
import test from 'node:test';
import { stdin } from 'node:process';
import { parseInput, RawInput, type InputEvent } from '../../src/cli/input.js';

test('input parser recognizes navigation, reverse tab and field editing shortcuts', () => {
  const { events, rest } = parseInput(
    '\x1b[A\x1b[B\x1b[C\x1b[D\t\x1b[Z\x1b[H\x1b[F\x1b[5~\x1b[6~\x1b[1;3D\x01\x15\x0c\x7f\x1b[3~\r\x03'
  );
  assert.deepEqual(
    events.map((event) => (event.type === 'key' ? event.name : event.type)),
    [
      'up',
      'down',
      'right',
      'left',
      'tab',
      'shift-tab',
      'home',
      'end',
      'page-up',
      'page-down',
      'alt-left',
      'ctrl-a',
      'ctrl-u',
      'ctrl-l',
      'backspace',
      'delete',
      'return',
      'ctrl-c',
    ]
  );
  assert.equal(rest, '');
});

test('bracketed paste stays a single field edit even when it contains Enter and escape sequences', () => {
  const payload = 'https://example.com/é界\n\x03\x1b[A';
  const parsed = parseInput('\x1b[200~' + payload + '\x1b[201~\r');
  assert.deepEqual(parsed.events, [
    { type: 'paste', text: payload },
    { type: 'key', name: 'return' },
  ]);
  assert.equal(parsed.rest, '');
});

test('fragmented paste, mouse and modified arrow sequences wait until their bytes are complete', () => {
  for (const full of ['\x1b[200~https://example.com\x1b[201~', '\x1b[<0;40;12m', '\x1b[1;3D']) {
    for (let split = 1; split < full.length; split++) {
      const first = parseInput(full.slice(0, split));
      const second = parseInput(first.rest + full.slice(split));
      assert.deepEqual(
        [...first.events, ...second.events],
        parseInput(full).events,
        `split ${split}`
      );
      assert.equal(second.rest, '');
    }
  }
});

test('mouse parsing preserves presses, releases, drag movement and modified wheel direction', () => {
  assert.deepEqual(
    parseInput('\x1b[<0;80;10M\x1b[<32;80;18M\x1b[<0;80;18m\x1b[<64;10;10M\x1b[<69;10;10M').events,
    [
      { type: 'mouse', kind: 'press', x: 80, y: 10 },
      { type: 'mouse', kind: 'move', x: 80, y: 18 },
      { type: 'mouse', kind: 'click', x: 80, y: 18 },
      { type: 'mouse', kind: 'wheel-up', x: 10, y: 10 },
      { type: 'mouse', kind: 'wheel-down', x: 10, y: 10 },
    ]
  );
});

test('raw input decodes UTF-8 across byte boundaries and restores the previous raw mode', async (t) => {
  const rawDescriptor = Object.getOwnPropertyDescriptor(stdin, 'isRaw');
  const methodDescriptor = Object.getOwnPropertyDescriptor(stdin, 'setRawMode');
  const calls: boolean[] = [];
  Object.defineProperty(stdin, 'isRaw', { configurable: true, writable: true, value: true });
  Object.defineProperty(stdin, 'setRawMode', {
    configurable: true,
    writable: true,
    value: (enabled: boolean) => {
      calls.push(enabled);
      return stdin;
    },
  });
  t.mock.method(stdin, 'resume', () => stdin);
  t.mock.method(stdin, 'pause', () => stdin);
  t.after(() => {
    if (rawDescriptor) Object.defineProperty(stdin, 'isRaw', rawDescriptor);
    else delete (stdin as { isRaw?: boolean }).isRaw;
    if (methodDescriptor) Object.defineProperty(stdin, 'setRawMode', methodDescriptor);
    else delete (stdin as { setRawMode?: unknown }).setRawMode;
  });
  const received: InputEvent[] = [];
  const input = new RawInput((event) => received.push(event));
  t.after(() => input.stop());
  input.start();
  for (const byte of Buffer.from('é界👩')) stdin.emit('data', Buffer.from([byte]));
  assert.deepEqual(received, [
    { type: 'char', char: 'é' },
    { type: 'char', char: '界' },
    { type: 'char', char: '👩' },
  ]);
  stdin.emit('data', Buffer.from('\x1b'));
  await new Promise((resolve) => setTimeout(resolve, 65));
  assert.deepEqual(received.at(-1), { type: 'key', name: 'escape' });
  input.stop();
  assert.deepEqual(calls, [true, true]);
  stdin.emit('data', Buffer.from('ignored'));
  assert.equal(received.length, 4);
});
