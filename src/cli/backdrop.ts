import chalk from 'chalk';
import { stdout } from 'node:process';

export interface ExcludeRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const FRAME_MS = 100;
const FBM_OCTAVES = 5;
const FBM_LACUNARITY = 1.25;
const FBM_GAIN = 1.0;
const PATTERN_SCALE = 3;
const PATTERN_DENSITY = 1.1;
const PIXEL_JITTER = 0.4;
const SPEED = 0.5;
const EDGE_FADE = 0.18;
const RIPPLE_SPEED = 0.4;
const RIPPLE_THICKNESS = 0.12;
const RIPPLE_INTENSITY = 1.4;
const MAX_CLICKS = 10;
const DAMP_T = 1.0;
const DAMP_R = 10.0;
const CELL_PX = 8;

const GLYPHS = ['·', '•', '▪', '●'];
const COLORS = ['#54402f', '#6b4c37', '#82593d', '#8f6244'];

function fract(v: number): number {
  return v - Math.floor(v);
}

function hash11(n: number): number {
  return fract(Math.sin(n) * 43758.5453);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function vnoise(px: number, py: number, pz: number): number {
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const iz = Math.floor(pz);
  const fx = px - ix;
  const fy = py - iy;
  const fz = pz - iz;
  const dot = (ox: number, oy: number, oz: number): number =>
    (ix + ox) * 1.0 + (iy + oy) * 57.0 + (iz + oz) * 113.0;
  const n000 = hash11(dot(0, 0, 0));
  const n100 = hash11(dot(1, 0, 0));
  const n010 = hash11(dot(0, 1, 0));
  const n110 = hash11(dot(1, 1, 0));
  const n001 = hash11(dot(0, 0, 1));
  const n101 = hash11(dot(1, 0, 1));
  const n011 = hash11(dot(0, 1, 1));
  const n111 = hash11(dot(1, 1, 1));
  const wx = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const wy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const wz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const x00 = mix(n000, n100, wx);
  const x10 = mix(n010, n110, wx);
  const x01 = mix(n001, n101, wx);
  const x11 = mix(n011, n111, wx);
  const y0 = mix(x00, x10, wy);
  const y1 = mix(x01, x11, wy);
  return mix(y0, y1, wz) * 2 - 1;
}

function fbm2(ux: number, uy: number, t: number): number {
  const px = ux * PATTERN_SCALE;
  const py = uy * PATTERN_SCALE;
  let amp = 1;
  let freq = 1;
  let sum = 1;
  for (let i = 0; i < FBM_OCTAVES; i++) {
    sum += amp * vnoise(px * freq, py * freq, t * freq);
    freq *= FBM_LACUNARITY;
    amp *= FBM_GAIN;
  }
  return sum * 0.5 + 0.5;
}

function bayer2exact(x: number, y: number): number {
  const ax = Math.floor(x);
  const ay = Math.floor(y);
  return fract(ax / 2 + ay * ay * 0.75);
}

function bayer4(x: number, y: number): number {
  return bayer2exact(0.5 * x, 0.5 * y) * 0.25 + bayer2exact(x, y);
}

function bayer8(x: number, y: number): number {
  return bayer4(0.5 * x, 0.5 * y) * 0.25 + bayer2exact(x, y);
}

interface Click {
  x: number;
  y: number;
  time: number;
}

export class Backdrop {
  private timer: NodeJS.Timeout | null = null;
  private disabled = false;
  private exclude: ExcludeRect | null = null;
  private prev = new Map<number, number>();
  private clicks: Click[] = [];
  private clickIx = 0;
  private timeOffset = Math.random() * 1000;
  private startedAt = Date.now();

  constructor() {
    if (process.env.FRAMER_EXPORT_NO_BG) this.disabled = true;
  }

  setExclude(rect: ExcludeRect): void {
    this.exclude = rect;
  }

  addClick(col: number, row: number): void {
    if (this.clicks.length < MAX_CLICKS) {
      this.clicks.push({ x: col, y: row * 2, time: this.now() });
    } else {
      this.clicks[this.clickIx] = { x: col, y: row * 2, time: this.now() };
    }
    this.clickIx = (this.clickIx + 1) % MAX_CLICKS;
  }

  start(): void {
    if (this.disabled || !stdout.isTTY || this.timer) return;
    this.startedAt = Date.now();
    this.paint();
    this.timer = setInterval(() => this.paint(), FRAME_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.erase();
  }

  private now(): number {
    return this.timeOffset + ((Date.now() - this.startedAt) / 1000) * SPEED;
  }

  private inExclude(x: number, y: number): boolean {
    const r = this.exclude;
    if (!r) return false;
    return y >= r.top && y < r.top + r.height && x >= r.left && x < r.left + r.width;
  }

  private erase(): void {
    if (this.prev.size === 0) return;
    const columns = stdout.columns || 80;
    let out = '';
    for (const key of this.prev.keys()) {
      const x = (key % columns) + 1;
      const y = Math.floor(key / columns) + 1;
      out += `\x1B[${y};${x}H `;
    }
    stdout.write(out);
    this.prev.clear();
  }

  private paint(): void {
    const rows = stdout.rows || 24;
    const columns = stdout.columns || 80;
    const resX = columns;
    const resY = rows * 2;
    const aspect = resX / resY;
    const t = this.now();
    const next = new Map<number, number>();
    let out = '';

    for (let row = 1; row <= rows; row++) {
      const fy = row * 2 - resY * 0.5;
      for (let col = 1; col <= columns; col++) {
        if (this.inExclude(col, row)) continue;
        const fx = col - resX * 0.5;
        const cellX = Math.floor(fx / CELL_PX) * CELL_PX;
        const cellY = Math.floor(fy / CELL_PX) * CELL_PX;
        const ux = (cellX / resX) * aspect;
        const uy = cellY / resY;
        let base = fbm2(ux, uy, t * 0.05);
        base = base * 0.5 - 0.65;
        let feed = base + (PATTERN_DENSITY - 0.5) * 0.3;

        for (const click of this.clicks) {
          const cux = ((click.x - resX * 0.5 - CELL_PX * 0.5) / resX) * aspect;
          const cuy = (click.y - resY * 0.5 - CELL_PX * 0.5) / resY;
          const dt = Math.max(t - click.time, 0);
          const r = Math.hypot(ux - cux, uy - cuy);
          const waveR = RIPPLE_SPEED * dt;
          const ring = Math.exp(-(((r - waveR) / RIPPLE_THICKNESS) ** 2));
          const atten = Math.exp(-DAMP_T * dt) * Math.exp(-DAMP_R * r);
          feed = Math.max(feed, ring * atten * RIPPLE_INTENSITY);
        }

        const bayer = bayer8(fx, fy) - 0.5;
        const bw = feed + bayer > 0.5 ? 1 : 0;
        if (!bw) continue;
        const h = fract(Math.sin(Math.floor(fx) * 127.1 + Math.floor(fy) * 311.7) * 43758.5453);
        const jitterScale = 1 + (h - 0.5) * PIXEL_JITTER;
        let coverage = bw * jitterScale;

        if (EDGE_FADE > 0) {
          const nx = col / columns;
          const ny = row / rows;
          const edge = Math.min(nx, ny, 1 - nx, 1 - ny);
          const fade = Math.min(1, Math.max(0, edge / EDGE_FADE));
          coverage *= fade * fade * (3 - 2 * fade);
        }
        if (coverage < 0.35) continue;

        const level = Math.min(3, Math.floor(h * 4));
        const key = (row - 1) * columns + (col - 1);
        next.set(key, level);
        if (this.prev.get(key) !== level) {
          out += `\x1B[${row};${col}H${chalk.hex(COLORS[level])(GLYPHS[level])}`;
        }
        this.prev.delete(key);
      }
    }

    for (const key of this.prev.keys()) {
      const x = (key % columns) + 1;
      const y = Math.floor(key / columns) + 1;
      if (!this.inExclude(x, y)) out += `\x1B[${y};${x}H `;
    }
    this.prev = next;
    if (out) stdout.write(out);
  }
}
