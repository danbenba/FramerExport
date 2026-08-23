import { stdin } from 'node:process';

export type KeyName =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'tab'
  | 'return'
  | 'escape'
  | 'backspace'
  | 'delete'
  | 'ctrl-c';

export type MouseKind = 'move' | 'click' | 'press' | 'wheel-up' | 'wheel-down';

export type InputEvent =
  | { type: 'key'; name: KeyName }
  | { type: 'char'; char: string }
  | { type: 'mouse'; kind: MouseKind; x: number; y: number };

const ESC = '\x1B';
const ESC_TIMEOUT_MS = 40;

export function parseInput(buffer: string): { events: InputEvent[]; rest: string } {
  const events: InputEvent[] = [];
  let i = 0;

  while (i < buffer.length) {
    const ch = buffer[i];

    if (ch === '\x03') {
      events.push({ type: 'key', name: 'ctrl-c' });
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      events.push({ type: 'key', name: 'return' });
      i++;
      continue;
    }
    if (ch === '\t') {
      events.push({ type: 'key', name: 'tab' });
      i++;
      continue;
    }
    if (ch === '\x7f' || ch === '\x08') {
      events.push({ type: 'key', name: 'backspace' });
      i++;
      continue;
    }

    if (ch === ESC) {
      const rest = buffer.slice(i);
      if (rest.length === 1) {
        return { events, rest };
      }
      const next = rest[1];

      if (next === '[' || next === 'O') {
        const sgr = rest.match(/^\x1B\[<(\d+);(\d+);(\d+)([mM])/);
        if (sgr) {
          const code = Number(sgr[1]);
          const x = Number(sgr[2]);
          const y = Number(sgr[3]);
          const release = sgr[4] === 'm';
          if (code === 64) events.push({ type: 'mouse', kind: 'wheel-up', x, y });
          else if (code === 65) events.push({ type: 'mouse', kind: 'wheel-down', x, y });
          else if ((code & 32) === 32) events.push({ type: 'mouse', kind: 'move', x, y });
          else if (release) events.push({ type: 'mouse', kind: 'click', x, y });
          else events.push({ type: 'mouse', kind: 'press', x, y });
          i += sgr[0].length;
          continue;
        }
        if (/^\x1B\[<[\d;]*$/.test(rest)) {
          return { events, rest };
        }

        const legacy = rest.match(/^\x1B\[M([\s\S])([\s\S])([\s\S])/);
        if (legacy) {
          const code = legacy[1].charCodeAt(0) - 32;
          const x = legacy[2].charCodeAt(0) - 32;
          const y = legacy[3].charCodeAt(0) - 32;
          if (code === 64) events.push({ type: 'mouse', kind: 'wheel-up', x, y });
          else if (code === 65) events.push({ type: 'mouse', kind: 'wheel-down', x, y });
          else if ((code & 32) === 32) events.push({ type: 'mouse', kind: 'move', x, y });
          else if ((code & 3) === 3) events.push({ type: 'mouse', kind: 'click', x, y });
          else events.push({ type: 'mouse', kind: 'press', x, y });
          i += legacy[0].length;
          continue;
        }
        if (/^\x1B\[M[\s\S]{0,2}$/.test(rest)) {
          return { events, rest };
        }

        const arrow = rest.match(/^\x1B[[O]([ABCD])/);
        if (arrow) {
          const names: Record<string, KeyName> = { A: 'up', B: 'down', C: 'right', D: 'left' };
          events.push({ type: 'key', name: names[arrow[1]] });
          i += arrow[0].length;
          continue;
        }

        if (rest.startsWith('\x1B[3~')) {
          events.push({ type: 'key', name: 'delete' });
          i += 4;
          continue;
        }

        const csi = rest.match(/^\x1B\[[0-?]*[ -/]*[@-~]/);
        if (csi) {
          i += csi[0].length;
          continue;
        }
        if (/^\x1B\[[0-?]*[ -/]*$/.test(rest)) {
          return { events, rest };
        }
        if (rest.length === 2) {
          return { events, rest };
        }
        i += 2;
        continue;
      }

      i += 2;
      continue;
    }

    if (ch >= ' ') {
      const code = buffer.codePointAt(i)!;
      const char = String.fromCodePoint(code);
      events.push({ type: 'char', char });
      i += char.length;
      continue;
    }

    i++;
  }

  return { events, rest: '' };
}

export class RawInput {
  private buffer = '';
  private escTimer: NodeJS.Timeout | null = null;
  private active = false;
  private onData = (chunk: Buffer): void => {
    this.buffer += chunk.toString('utf-8');
    this.drain();
  };

  constructor(private handler: (event: InputEvent) => void) {}

  start(): void {
    if (this.active) return;
    this.active = true;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', this.onData);
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    if (this.escTimer) clearTimeout(this.escTimer);
    this.escTimer = null;
    stdin.removeListener('data', this.onData);
    stdin.setRawMode(false);
    stdin.pause();
  }

  private drain(): void {
    if (this.escTimer) {
      clearTimeout(this.escTimer);
      this.escTimer = null;
    }
    const { events, rest } = parseInput(this.buffer);
    this.buffer = rest;
    for (const event of events) {
      if (!this.active) return;
      this.handler(event);
    }
    if (rest === ESC) {
      this.escTimer = setTimeout(() => {
        if (this.buffer === ESC) {
          this.buffer = '';
          if (this.active) this.handler({ type: 'key', name: 'escape' });
        }
      }, ESC_TIMEOUT_MS);
    }
  }
}
