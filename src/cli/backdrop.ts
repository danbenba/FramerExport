import chalk from 'chalk';
import { stdout } from 'node:process';

export interface ExcludeRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const GLYPHS = ['·', '·', '•', '▪'];
const COLORS = ['#3d332a', '#4a3b2d', '#584535', '#33302c'];
const FRAME_MS = 160;
const DENSITY = 28;

function hash(x: number, y: number, frame: number): number {
  let h = x * 374761393 + y * 668265263 + frame * 2246822519;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return Math.abs(h) % 1000;
}

export class Backdrop {
  private timer: NodeJS.Timeout | null = null;
  private frame = 0;
  private prev: Array<[number, number]> = [];
  private exclude: ExcludeRect | null = null;

  constructor() {
    if (process.env.FRAMER_EXPORT_NO_BG) this.frame = -1;
  }

  setExclude(rect: ExcludeRect): void {
    this.exclude = rect;
  }

  start(): void {
    if (this.frame === -1 || !stdout.isTTY || this.timer) return;
    this.paint();
    this.timer = setInterval(() => this.paint(), FRAME_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.erasePrev();
    this.prev = [];
  }

  private inExclude(x: number, y: number): boolean {
    const r = this.exclude;
    if (!r) return false;
    return y >= r.top && y < r.top + r.height && x >= r.left && x < r.left + r.width;
  }

  private erasePrev(): void {
    if (this.prev.length === 0) return;
    let out = '';
    for (const [x, y] of this.prev) {
      out += `\x1B[${y};${x}H `;
    }
    stdout.write(out);
  }

  private paint(): void {
    const rows = stdout.rows || 24;
    const columns = stdout.columns || 80;
    this.frame++;
    let out = '';
    for (const [x, y] of this.prev) {
      if (!this.inExclude(x, y)) out += `\x1B[${y};${x}H `;
    }
    const next: Array<[number, number]> = [];
    for (let y = 1; y <= rows; y += 2) {
      for (let x = 1; x <= columns; x += 2) {
        const h = hash(x, y, Math.floor(this.frame / 3) + Math.floor(x / 24) + Math.floor(y / 12));
        if (h >= DENSITY) continue;
        if (this.inExclude(x, y)) continue;
        const glyph = GLYPHS[h % GLYPHS.length];
        const color = COLORS[(h >> 2) % COLORS.length];
        out += `\x1B[${y};${x}H${chalk.hex(color)(glyph)}`;
        next.push([x, y]);
      }
    }
    this.prev = next;
    stdout.write(out);
  }
}
