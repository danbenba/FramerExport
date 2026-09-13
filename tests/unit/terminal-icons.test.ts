import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import type { ReadStream, WriteStream } from 'node:tty';
import { providerPresentation } from '../../src/platforms/presentation.js';
import {
  detectTerminalImageSupport,
  encodeSixel,
  providerMonogram,
  terminalImageSupportFromEnvironment,
  TerminalIconRenderer,
  type TerminalIconPlacement,
} from '../../src/cli/terminal-icons.js';

class Input extends PassThrough {
  isTTY = true;
  isRaw = false;
  setRawMode(value: boolean): this {
    this.isRaw = value;
    return this;
  }
}

const placement: TerminalIconPlacement = { providerId: 'framer', x: 3, y: 5, columns: 8, rows: 4 };
const viewport = { columns: 80, rows: 24 };

test('only identified image protocols are enabled without a capability reply', () => {
  assert.equal(terminalImageSupportFromEnvironment({ TERM: 'xterm-kitty' }, true).mode, 'kitty');
  assert.equal(
    terminalImageSupportFromEnvironment({ TERM_PROGRAM: 'iTerm.app' }, true).mode,
    'iterm'
  );
  assert.equal(
    terminalImageSupportFromEnvironment({ TERM_PROGRAM: 'WezTerm' }, true).mode,
    'iterm'
  );
  assert.equal(terminalImageSupportFromEnvironment({ WT_SESSION: 'present' }, true).mode, 'text');
  assert.equal(terminalImageSupportFromEnvironment({ TERM: 'xterm-256color' }, true).mode, 'text');
  assert.equal(terminalImageSupportFromEnvironment({ TERM: 'xterm-kitty' }, false).mode, 'text');
  for (const extra of [{ TMUX: 'mux' }, { STY: 'screen' }, { FEXPORT_TERMINAL_IMAGES: '0' }]) {
    assert.equal(
      terminalImageSupportFromEnvironment({ TERM: 'xterm-kitty', ...extra }, true).mode,
      'text'
    );
  }
});

test('SIXEL detection requires feature 4 and measured cells, preserves split UTF-8 input and restores raw mode', async () => {
  const input = new Input();
  input.isRaw = true;
  const output = new PassThrough();
  Object.assign(output, { isTTY: true });
  let queries = '';
  output.on('data', (chunk) => {
    queries += chunk.toString();
    input.write(Buffer.concat([Buffer.from('é🙂').subarray(0, 3), Buffer.from('\x1b[?62;')]));
    input.write(Buffer.from('4;22c\x1b[6;20;10t'));
    input.write(Buffer.from('é🙂').subarray(3));
  });
  const support = await detectTerminalImageSupport({
    input: input as unknown as ReadStream,
    output: output as unknown as WriteStream,
    env: { WT_SESSION: 'test' },
  });
  assert.deepEqual(support, { mode: 'sixel', cellWidth: 10, cellHeight: 20 });
  assert.equal(queries, '\x1b[c\x1b[16t');
  assert.equal(input.isRaw, true);
  assert.equal(input.listenerCount('data'), 0);
  assert.equal(input.read().toString(), 'é🙂');
  input.destroy();
  output.destroy();
});

test('missing, unsupported or invalid SIXEL replies fall back without losing keystrokes', async () => {
  for (const response of [
    '',
    'x\x1b[?62;22c\x1b[6;20;10t',
    'x\x1b[?62;4c',
    'x\x1b[?62;4c\x1b[6;0;10t',
  ]) {
    const input = new Input();
    const output = new PassThrough();
    Object.assign(output, { isTTY: true });
    output.on('data', () => {
      if (response) input.write(response);
    });
    assert.equal(
      (
        await detectTerminalImageSupport({
          input: input as unknown as ReadStream,
          output: output as unknown as WriteStream,
          env: {},
          timeoutMs: 20,
        })
      ).mode,
      'text'
    );
    assert.equal(input.isRaw, false);
    assert.equal(input.listenerCount('data'), 0);
    assert.equal(input.read()?.toString() ?? '', response ? 'x' : '');
    input.destroy();
    output.destroy();
  }
});

test('Kitty transmits the exact PNG in bounded chunks, replaces placements and releases only owned images', () => {
  const renderer = new TerminalIconRenderer({ mode: 'kitty' });
  const first = renderer.frame([placement], viewport);
  const payloads = [...first.after.matchAll(/\x1b_G([^;]+);([^\x1b]*)\x1b\\/g)];
  const transmissions = payloads.filter((match) => match[2]);
  assert.ok(transmissions.length > 0);
  assert.ok(transmissions.every((match) => match[2].length <= 4096));
  assert.equal(
    transmissions.map((match) => match[2]).join(''),
    providerPresentation('framer').iconDataUri.split(',')[1]
  );
  assert.match(first.after, /\x1b\[6;4H/);
  assert.match(first.after, /c=8,r=4,C=1,q=2/);
  assert.equal(first.forceRepaint, false);
  const next = renderer.frame([{ ...placement, x: 12 }], viewport);
  assert.match(next.before, /a=d,d=i,i=\d+,q=2/);
  assert.doesNotMatch(next.after, /a=t/);
  assert.match(next.after, /\x1b\[6;13H/);
  assert.deepEqual(renderer.frame([{ ...placement, x: 12 }], viewport, false), {
    before: '',
    after: '',
    forceRepaint: false,
  });
  assert.match(renderer.cleanup(), /a=d,d=I,i=\d+,q=2/);
  assert.equal(renderer.cleanup(), '');
});

test('fully hidden or clipped images never write past the viewport, including its last row', () => {
  for (const mode of ['kitty', 'iterm', 'sixel'] as const) {
    const renderer = new TerminalIconRenderer({ mode, cellWidth: 10, cellHeight: 20 });
    for (const invalid of [
      { x: -1 },
      { y: -1 },
      { columns: 99 },
      { rows: 99 },
      { x: NaN },
      { rows: 19 },
      { columns: 0 },
    ]) {
      assert.equal(renderer.frame([{ ...placement, ...invalid }], viewport).after, '');
    }
    assert.equal(renderer.frame([placement], { columns: 1, rows: 1 }).after, '');
  }
});

test('iTerm images preserve aspect ratio and clear previous images when a modal replaces them', () => {
  const renderer = new TerminalIconRenderer({ mode: 'iterm' });
  const first = renderer.frame([placement], viewport);
  assert.equal(first.before, '\x1b[2J');
  assert.equal(first.forceRepaint, true);
  assert.match(
    first.after,
    /File=inline=1;size=\d+;width=8;height=4;preserveAspectRatio=1;doNotMoveCursor=1:/
  );
  assert.ok(first.after.endsWith('\x07\x1b8'));
  assert.deepEqual(renderer.frame([placement], viewport, false), {
    before: '',
    after: '',
    forceRepaint: false,
  });
  assert.deepEqual(renderer.frame([], viewport), {
    before: '\x1b[2J',
    after: '',
    forceRepaint: true,
  });
  assert.equal(renderer.cleanup(), '');
});

test('SIXEL native dimensions follow terminal cells and are refreshed after a font resize', () => {
  const renderer = new TerminalIconRenderer({ mode: 'sixel', cellWidth: 10, cellHeight: 20 });
  const first = renderer.frame([placement], viewport);
  assert.match(first.after, /\x1bP0;1q"1;1;76;76/);
  assert.ok(first.after.length < 30000);
  assert.equal(renderer.setSupport({ mode: 'sixel', cellWidth: 6, cellHeight: 12 }), '\x1b[2J');
  assert.match(renderer.frame([placement], viewport).after, /\x1bP0;1q"1;1;44;44/);
  assert.equal(renderer.setSupport({ mode: 'text' }), '\x1b[2J');
  assert.deepEqual(renderer.frame([placement], viewport), {
    before: '',
    after: '',
    forceRepaint: false,
  });
});

test('SIXEL encoding retains pixel positions, alpha blending, final partial bands and bounded palette entries', () => {
  const rgba = new Uint8Array(8 * 8 * 4);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const offset = (y * 8 + x) * 4;
      rgba.set([x < 4 ? 255 : 0, y < 6 ? 0 : 255, 0, x === 7 ? 128 : 255], offset);
    }
  const decoded = decodeSixel(encodeSixel(rgba, 8, 8, '#0000FF'));
  assert.deepEqual(decoded.size, [8, 8]);
  assert.deepEqual(decoded.pixels[0], [100, 0, 0]);
  assert.deepEqual(decoded.pixels[7], [0, 0, 50]);
  assert.deepEqual(decoded.pixels[6 * 8], [100, 100, 0]);
  assert.deepEqual(decoded.pixels[7 * 8 + 7], [0, 50, 50]);
  assert.ok(decoded.pixels.every(Boolean));
  assert.throws(() => encodeSixel(new Uint8Array(1), 1, 1), RangeError);
  assert.throws(() => encodeSixel(new Uint8Array(), 0, 0), RangeError);
});

test('fallback identities are readable ASCII monograms and cannot inject terminal controls', () => {
  for (const id of ['framer', 'webflow', 'wix', 'unknown', '__proto__', '\x1b[2J']) {
    assert.match(providerMonogram(id), /^[A-Za-z]{1,2}$/);
  }
  assert.notEqual(providerMonogram('webflow'), providerMonogram('weebly'));
});

function decodeSixel(sequence: string): { size: number[]; pixels: number[][] } {
  const size = sequence
    .match(/"1;1;(\d+);(\d+)/)!
    .slice(1)
    .map(Number);
  const pixels: number[][] = new Array(size[0] * size[1]);
  const palette = new Map<number, number[]>();
  const body = sequence.slice(sequence.indexOf('"') + `"1;1;${size[0]};${size[1]}`.length, -2);
  let x = 0,
    y = 0,
    color = 0;
  const paint = (character: string, count = 1): void => {
    for (let index = 0; index < count; index++, x++) {
      const value = character.charCodeAt(0) - 63;
      for (let bit = 0; bit < 6; bit++) {
        if (value & (1 << bit)) pixels[(y + bit) * size[0] + x] = palette.get(color)!;
      }
    }
  };
  for (let i = 0; i < body.length; ) {
    const rest = body.slice(i);
    const definition = rest.match(/^#(\d+);2;(\d+);(\d+);(\d+)/);
    const selection = rest.match(/^#(\d+)/);
    const repeat = rest.match(/^!(\d+)([?-~])/);
    if (definition) {
      color = Number(definition[1]);
      palette.set(color, definition.slice(2).map(Number));
      i += definition[0].length;
    } else if (selection) {
      color = Number(selection[1]);
      i += selection[0].length;
    } else if (repeat) {
      paint(repeat[2], Number(repeat[1]));
      i += repeat[0].length;
    } else if (body[i] === '$') {
      x = 0;
      i++;
    } else if (body[i] === '-') {
      x = 0;
      y += 6;
      i++;
    } else {
      paint(body[i]);
      i++;
    }
  }
  return { size, pixels };
}
