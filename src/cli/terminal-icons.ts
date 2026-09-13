import { randomInt } from 'node:crypto';
import { stdin, stdout } from 'node:process';
import type { ReadStream, WriteStream } from 'node:tty';
import { inflateSync } from 'node:zlib';
import { providerPresentation, type ProviderId } from '../platforms/presentation.js';
import { THEME } from './theme.js';

export interface TerminalImageSupport {
  mode: 'text' | 'kitty' | 'iterm' | 'sixel';
  cellWidth?: number;
  cellHeight?: number;
}

export interface TerminalImageRectangle {
  x: number;
  y: number;
  columns: number;
  rows: number;
}

export interface TerminalIconPlacement extends TerminalImageRectangle {
  providerId: ProviderId;
  background?: string;
}

export interface TerminalIconFrame {
  before: string;
  after: string;
  forceRepaint: boolean;
  repaintRects?: TerminalImageRectangle[];
}

export function terminalImageSupportFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  isTTY = stdout.isTTY
): TerminalImageSupport {
  if (!isTTY || env.TERM === 'dumb' || env.TMUX || env.STY || env.FEXPORT_TERMINAL_IMAGES === '0')
    return { mode: 'text' };
  if (env.TERM === 'xterm-kitty' || env.KITTY_WINDOW_ID || env.TERM_PROGRAM === 'ghostty')
    return { mode: 'kitty' };
  if (env.TERM_PROGRAM === 'iTerm.app' || env.TERM_PROGRAM === 'WezTerm') return { mode: 'iterm' };
  return { mode: 'text' };
}

export async function detectTerminalImageSupport(
  options: {
    input?: ReadStream;
    output?: WriteStream;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
  } = {}
): Promise<TerminalImageSupport> {
  const input = options.input ?? stdin;
  const output = options.output ?? stdout;
  const env = options.env ?? process.env;
  const initial = terminalImageSupportFromEnvironment(env, output.isTTY);
  if (
    initial.mode !== 'text' ||
    !input.isTTY ||
    !output.isTTY ||
    env.TERM === 'dumb' ||
    env.TMUX ||
    env.STY ||
    env.FEXPORT_TERMINAL_IMAGES === '0'
  )
    return initial;
  return new Promise((resolve) => {
    const wasRaw = input.isRaw;
    let data = '';
    let finished = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      input.pause();
      input.removeListener('data', receive);
      input.setRawMode(wasRaw);
      const attributes = [...data.matchAll(/\x1b\[\?([0-9;]+)c/g)].at(-1)?.[1].split(';').slice(1);
      const cell = [...data.matchAll(/\x1b\[6;([0-9]+);([0-9]+)t/g)].at(-1);
      const height = Number(cell?.[1]);
      const width = Number(cell?.[2]);
      const remaining = data.replace(/\x1b\[\?[0-9;]+c|\x1b\[6;[0-9]+;[0-9]+t/g, '');
      if (remaining) input.unshift(Buffer.from(remaining, 'latin1'));
      resolve(
        attributes?.includes('4') && width >= 1 && width <= 128 && height >= 1 && height <= 256
          ? { mode: 'sixel', cellWidth: width, cellHeight: height }
          : initial
      );
    };
    const receive = (chunk: Buffer | string): void => {
      data += Buffer.isBuffer(chunk)
        ? chunk.toString('latin1')
        : Buffer.from(chunk).toString('latin1');
      if (
        (/\x1b\[\?[0-9;]+c/.test(data) && /\x1b\[6;[0-9]+;[0-9]+t/.test(data)) ||
        data.length > 65536
      )
        finish();
    };
    input.setRawMode(true);
    input.on('data', receive);
    input.resume();
    timer = setTimeout(finish, Math.max(20, Math.min(1000, options.timeoutMs ?? 200)));
    output.write('\x1b[c\x1b[16t');
  });
}

const monograms: Partial<Record<ProviderId, string>> = {
  auto: 'A',
  framer: 'F',
  webflow: 'Wf',
  wix: 'Wi',
  bubble: 'B',
  carrd: 'C',
  duda: 'D',
  squarespace: 'Sq',
  strikingly: 'St',
  tilda: 'T',
  weebly: 'We',
  clickfunnels: 'Cf',
  elementor: 'E',
  instapage: 'I',
  systemeio: 'Sy',
  unbounce: 'U',
  ghost: 'Gh',
  notion: 'N',
  wordpress: 'Wp',
  kajabi: 'K',
  podia: 'P',
  teachable: 'Te',
  thinkific: 'Th',
  gumroad: 'Gu',
  shopify: 'Sh',
  gamma: 'Ga',
};

export function providerMonogram(id: string): string {
  return Object.hasOwn(monograms, id) ? monograms[id as ProviderId]! : 'A';
}

export class TerminalIconRenderer {
  private images = new Map<ProviderId, number>();
  private kittyPlacements = new Map<string, { imageId: number; placementId: number }>();
  private inlinePlacements = new Map<string, TerminalIconPlacement>();
  private nextId = randomInt(1, 60_000_000);
  private nextPlacementId = 1;
  private cache = new Map<string, string>();
  private viewport?: { columns: number; rows: number };

  constructor(private support: TerminalImageSupport = terminalImageSupportFromEnvironment()) {}

  get mode(): TerminalImageSupport['mode'] {
    return this.support.mode;
  }

  setSupport(support: TerminalImageSupport): string {
    const erase = this.cleanup();
    this.support = support;
    return erase;
  }

  frame(
    placements: readonly TerminalIconPlacement[],
    viewport: { columns: number; rows: number },
    contentChanged = true,
    dirtyRects?: readonly TerminalImageRectangle[]
  ): TerminalIconFrame {
    if (this.mode === 'text') return { before: '', after: '', forceRepaint: false };
    const visible = placements.filter(
      (placement) =>
        [
          placement.x,
          placement.y,
          placement.columns,
          placement.rows,
          viewport.columns,
          viewport.rows,
        ].every(Number.isInteger) &&
        placement.x >= 0 &&
        placement.y >= 0 &&
        placement.columns > 0 &&
        placement.rows > 0 &&
        placement.x + placement.columns <= viewport.columns &&
        placement.y + placement.rows < viewport.rows
    );
    const resized =
      !!this.viewport &&
      (this.viewport.columns !== viewport.columns || this.viewport.rows !== viewport.rows);
    this.viewport = { ...viewport };
    if (this.mode === 'kitty') return this.kittyFrame(visible, resized);
    const next = new Map(visible.map((placement) => [placementKey(placement), { ...placement }]));
    const repaintRects = [...this.inlinePlacements]
      .filter(([key]) => !next.has(key))
      .flatMap(([, placement]) => {
        const clipped = clipRectangle(placement, viewport);
        return clipped ? [clipped] : [];
      });
    const dirty = resized
      ? [{ x: 0, y: 0, ...viewport }]
      : [...(contentChanged ? (dirtyRects ?? [{ x: 0, y: 0, ...viewport }]) : []), ...repaintRects];
    const redraw = [...next]
      .filter(
        ([key, placement]) =>
          !this.inlinePlacements.has(key) ||
          dirty.some((rect) => rectanglesOverlap(placement, rect))
      )
      .map(([, placement]) => placement);
    this.inlinePlacements = next;
    let after = '';
    for (const placement of redraw) {
      const presentation = providerPresentation(placement.providerId);
      const cursor = `\x1b[${placement.y + 1};${placement.x + 1}H`;
      if (this.mode === 'iterm') {
        const data = presentation.iconDataUri.split(',')[1];
        after +=
          '\x1b7' +
          cursor +
          `\x1b]1337;File=inline=1;size=${Buffer.from(data, 'base64').length};width=${placement.columns};height=${placement.rows};preserveAspectRatio=1;doNotMoveCursor=1:${data}\x07` +
          '\x1b8';
      } else {
        const width = this.support.cellWidth;
        const height = this.support.cellHeight;
        if (!width || !height) continue;
        const size = Math.max(
          1,
          Math.floor(
            Math.min(256, placement.columns * (width - 0.5), placement.rows * (height - 0.5))
          )
        );
        const background = /^#[0-9a-f]{6}$/i.test(presentation.iconBackground)
          ? presentation.iconBackground
          : (placement.background ?? THEME.background);
        const key = `${placement.providerId}:${size}:${background}`;
        let sixel = this.cache.get(key);
        if (!sixel) {
          const pixels = inflateSync(Buffer.from(presentation.iconRgba.deflateBase64, 'base64'));
          sixel = encodeSixel(
            resampleRgba(pixels, presentation.iconRgba.width, size),
            size,
            size,
            background
          );
          if (this.cache.size >= 104) this.cache.delete(this.cache.keys().next().value!);
          this.cache.set(key, sixel);
        }
        after += '\x1b7' + cursor + sixel + '\x1b8';
      }
    }
    return {
      before: '',
      after,
      forceRepaint: resized,
      ...(repaintRects.length ? { repaintRects } : {}),
    };
  }

  private kittyFrame(
    placements: readonly TerminalIconPlacement[],
    resized = false
  ): TerminalIconFrame {
    const nextKeys = new Set(resized ? [] : placements.map(placementKey));
    let before = '';
    for (const [key, placement] of this.kittyPlacements) {
      if (nextKeys.has(key)) continue;
      before += `\x1b_Ga=d,d=i,i=${placement.imageId},p=${placement.placementId},q=2;\x1b\\`;
      this.kittyPlacements.delete(key);
    }
    let after = '';
    for (const placement of placements) {
      const key = placementKey(placement);
      if (this.kittyPlacements.has(key)) continue;
      let id = this.images.get(placement.providerId);
      if (id === undefined) {
        id = this.nextId++;
        this.images.set(placement.providerId, id);
        const data = providerPresentation(placement.providerId).iconDataUri.split(',')[1];
        for (let start = 0; start < data.length; start += 4096) {
          const more = start + 4096 < data.length ? 1 : 0;
          const header = start === 0 ? `a=t,f=100,t=d,i=${id},q=2,m=${more}` : `m=${more},q=2`;
          after += `\x1b_G${header};${data.slice(start, start + 4096)}\x1b\\`;
        }
      }
      const placementId = this.nextPlacementId++;
      after += `\x1b7\x1b[${placement.y + 1};${placement.x + 1}H\x1b_Ga=p,i=${id},p=${placementId},c=${placement.columns},r=${placement.rows},C=1,q=2;\x1b\\\x1b8`;
      this.kittyPlacements.set(key, { imageId: id, placementId });
    }
    return { before, after, forceRepaint: false };
  }

  cleanup(): string {
    const erase =
      [...this.images.values()].map((id) => `\x1b_Ga=d,d=I,i=${id},q=2;\x1b\\`).join('') +
      eraseRectangles([...this.inlinePlacements.values()], this.viewport);
    this.images.clear();
    this.kittyPlacements.clear();
    this.inlinePlacements.clear();
    this.viewport = undefined;
    this.cache.clear();
    return erase;
  }
}

function placementKey(placement: TerminalIconPlacement): string {
  return `${placement.providerId}:${placement.x}:${placement.y}:${placement.columns}:${placement.rows}:${placement.background ?? ''}`;
}

function rectanglesOverlap(left: TerminalImageRectangle, right: TerminalImageRectangle): boolean {
  return (
    left.x < right.x + right.columns &&
    left.x + left.columns > right.x &&
    left.y < right.y + right.rows &&
    left.y + left.rows > right.y
  );
}

function clipRectangle(
  rect: TerminalImageRectangle,
  viewport: { columns: number; rows: number }
): TerminalImageRectangle | null {
  const x = Math.max(0, rect.x);
  const y = Math.max(0, rect.y);
  const columns = Math.min(viewport.columns, rect.x + rect.columns) - x;
  const rows = Math.min(viewport.rows, rect.y + rect.rows) - y;
  return columns > 0 && rows > 0 ? { x, y, columns, rows } : null;
}

function eraseRectangles(
  rects: readonly TerminalImageRectangle[],
  viewport?: { columns: number; rows: number }
): string {
  if (!viewport) return '';
  let output = '';
  for (const value of rects) {
    const rect = clipRectangle(value, viewport);
    if (!rect) continue;
    for (let row = rect.y; row < rect.y + rect.rows; row++)
      output += `\x1b[${row + 1};${rect.x + 1}H\x1b[${rect.columns}X`;
  }
  return output ? '\x1b7' + output + '\x1b8' : '';
}

function resampleRgba(source: Uint8Array, width: number, size: number): Uint8Array {
  const output = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const left = (x * width) / size;
      const right = ((x + 1) * width) / size;
      const top = (y * width) / size;
      const bottom = ((y + 1) * width) / size;
      const total = (right - left) * (bottom - top);
      let alpha = 0;
      const channels = [0, 0, 0];
      for (let sy = Math.floor(top); sy < Math.ceil(bottom); sy++) {
        for (let sx = Math.floor(left); sx < Math.ceil(right); sx++) {
          const weight =
            (Math.min(right, sx + 1) - Math.max(left, sx)) *
            (Math.min(bottom, sy + 1) - Math.max(top, sy));
          const offset = (sy * width + sx) * 4;
          const opacity = source[offset + 3] / 255;
          alpha += weight * opacity;
          for (let channel = 0; channel < 3; channel++)
            channels[channel] += source[offset + channel] * weight * opacity;
        }
      }
      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++)
        output[offset + channel] = alpha ? Math.round(channels[channel] / alpha) : 0;
      output[offset + 3] = Math.round((alpha / total) * 255);
    }
  }
  return output;
}

export function encodeSixel(
  rgba: Uint8Array,
  width: number,
  height: number,
  background = THEME.background
): string {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 256 ||
    height > 256 ||
    rgba.length !== width * height * 4
  )
    throw new RangeError('Invalid terminal image dimensions');
  const backdrop = /^#[0-9a-f]{6}$/i.test(background) ? background : THEME.background;
  const bg = [1, 3, 5].map((offset) => parseInt(backdrop.slice(offset, offset + 2), 16));
  const counts = new Map<number, number>();
  const colors = new Uint32Array(width * height);
  for (let i = 0; i < colors.length; i++) {
    const alpha = rgba[i * 4 + 3] / 255;
    const channels = bg.map((channel, n) =>
      Math.round(((rgba[i * 4 + n] * alpha + channel * (1 - alpha)) / 255) * 100)
    );
    const color = (channels[0] << 16) | (channels[1] << 8) | channels[2];
    colors[i] = color;
    counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  const palette = [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 256)
    .map(([color]) => color);
  const indices = new Map(palette.map((color, index) => [color, index]));
  for (const color of counts.keys()) {
    if (indices.has(color)) continue;
    let closest = 0;
    let distance = Infinity;
    palette.forEach((candidate, index) => {
      const delta =
        ((color >> 16) - (candidate >> 16)) ** 2 +
        (((color >> 8) & 255) - ((candidate >> 8) & 255)) ** 2 +
        ((color & 255) - (candidate & 255)) ** 2;
      if (delta < distance) {
        distance = delta;
        closest = index;
      }
    });
    indices.set(color, closest);
  }
  let output = `\x1bP0;1q"1;1;${width};${height}`;
  palette.forEach((color, index) => {
    output += `#${index};2;${color >> 16};${(color >> 8) & 255};${color & 255}`;
  });
  for (let y = 0; y < height; y += 6) {
    const bands = new Map<number, Uint8Array>();
    for (let bit = 0; bit < 6 && y + bit < height; bit++) {
      for (let x = 0; x < width; x++) {
        const index = indices.get(colors[(y + bit) * width + x])!;
        let band = bands.get(index);
        if (!band) {
          band = new Uint8Array(width);
          bands.set(index, band);
        }
        band[x] |= 1 << bit;
      }
    }
    for (const [index, band] of bands) {
      output += `#${index}`;
      let end = band.length;
      while (end > 0 && band[end - 1] === 0) end--;
      for (let x = 0; x < end; ) {
        let run = 1;
        while (x + run < end && band[x + run] === band[x]) run++;
        const character = String.fromCharCode(63 + band[x]);
        output += run > 3 ? `!${run}${character}` : character.repeat(run);
        x += run;
      }
      output += '$';
    }
    if (y + 6 < height) output += '-';
  }
  return output + '\x1b\\';
}
