import stringWidth from 'string-width';
import { stripVTControlCharacters } from 'node:util';
import { THEME } from './theme.js';

export interface CellStyle {
  fg?: string;
  bg?: string;
  bold?: boolean;
}
interface Cell {
  text: string;
  width: number;
  style: CellStyle;
  painted?: boolean;
  uncertainWidth?: boolean;
}
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const simpleText = /^[\x20-\x7e\u2500-\u259f]*$/;
const terminalDependentWidth = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u;
export interface TerminalRect {
  x: number;
  y: number;
  columns: number;
  rows: number;
}

export function plainText(value: string): string {
  if (!/[\x00-\x1f\x7f-\x9f]/.test(value)) return value;
  return stripVTControlCharacters(value).replace(/[\x00-\x1f\x7f-\x9f]/g, '');
}
export function textWidth(value: string): number {
  if (simpleText.test(value)) return value.length;
  return stringWidth(plainText(value));
}
export function fitText(value: string, width: number, ellipsis = true): string {
  const clean = plainText(value);
  if (width <= 0) return '';
  if (simpleText.test(clean))
    return clean.length <= width
      ? clean
      : clean.slice(0, Math.max(0, width - (ellipsis ? 1 : 0))) + (ellipsis ? '…' : '');
  if (stringWidth(clean) <= width) return clean;
  const limit = Math.max(0, width - (ellipsis ? 1 : 0));
  let output = '',
    used = 0;
  for (const { segment } of graphemes.segment(clean)) {
    const size = stringWidth(segment);
    if (used + size > limit) break;
    output += segment;
    used += size;
  }
  return output + (ellipsis ? '…' : '');
}
export function wrapText(value: string, width: number): string[] {
  if (width < 1) return [];
  const lines: string[] = [];
  let line = '';
  for (const word of plainText(value).split(/\s+/)) {
    if (line && textWidth(line + ' ' + word) > width) {
      lines.push(line);
      line = '';
    }
    let remaining = word;
    while (textWidth(remaining) > width) {
      const part = fitText(remaining, width, false);
      if (!part) {
        remaining = remaining.slice([...remaining][0]?.length || 1);
        continue;
      }
      lines.push(part);
      remaining = remaining.slice(part.length);
    }
    if (remaining) line += (line ? ' ' : '') + remaining;
  }
  if (line) lines.push(line);
  return lines;
}

export class TerminalCanvas {
  readonly width: number;
  readonly height: number;
  private cells: Cell[][];
  private blank: Cell;
  constructor(
    width: number,
    height: number,
    readonly background = THEME.background
  ) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.blank = { text: ' ', width: 1, style: { fg: THEME.text, bg: background } };
    this.cells = Array.from({ length: this.height }, () => Array(this.width).fill(this.blank));
  }
  text(
    x: number,
    y: number,
    value: string,
    style: CellStyle = {},
    maxWidth = this.width - x
  ): void {
    if (y < 0 || y >= this.height || maxWidth <= 0) return;
    const clean = plainText(value);
    const cellStyle = { fg: THEME.text, bg: this.background, ...style };
    if (simpleText.test(clean)) {
      const start = Math.max(0, x);
      const end = Math.min(this.width, x + maxWidth, x + clean.length);
      if (start >= end) return;
      this.clearCell(start, y);
      this.clearCell(end - 1, y);
      for (let col = start; col < end; col++)
        this.cells[y][col] = { text: clean[col - x], width: 1, painted: true, style: cellStyle };
      return;
    }
    let col = x;
    for (const { segment } of graphemes.segment(clean)) {
      const size = stringWidth(segment);
      if (!size) continue;
      if (col + size > x + maxWidth || col + size > this.width) break;
      if (col >= 0) {
        for (let i = 0; i < size; i++) this.clearCell(col + i, y);
        this.cells[y][col] = {
          text: segment,
          width: size,
          painted: true,
          style: cellStyle,
          uncertainWidth: terminalDependentWidth.test(segment),
        };
        for (let i = 1; i < size; i++)
          this.cells[y][col + i] = { text: '', width: 0, style: cellStyle };
      }
      col += size;
    }
  }
  private clearCell(x: number, y: number): void {
    let start = x;
    while (start > 0 && this.cells[y][start].width === 0) start--;
    const end = Math.min(this.width, start + Math.max(1, this.cells[y][start].width));
    for (let col = start; col < end; col++) this.cells[y][col] = this.blank;
  }
  fill(
    x: number,
    y: number,
    width: number,
    height: number,
    style: CellStyle = {},
    character = ' '
  ): void {
    if (character === ' ') {
      const left = Math.max(0, x),
        right = Math.min(this.width, x + width);
      if (left >= right) return;
      const cell: Cell = {
        text: ' ',
        width: 1,
        painted: true,
        style: { fg: THEME.text, bg: this.background, ...style },
      };
      for (let row = Math.max(0, y); row < Math.min(this.height, y + height); row++) {
        this.clearCell(left, row);
        this.clearCell(right - 1, row);
        this.cells[row].fill(cell, left, right);
      }
      return;
    }
    for (let row = Math.max(0, y); row < Math.min(this.height, y + height); row++) {
      this.text(
        Math.max(0, x),
        row,
        character.repeat(Math.max(0, Math.min(this.width, x + width) - Math.max(0, x))),
        style,
        Math.max(0, Math.min(this.width, x + width) - Math.max(0, x))
      );
    }
  }
  box(x: number, y: number, width: number, height: number, style: CellStyle = {}): void {
    this.fill(x, y, width, height, style);
    if (width < 2 || height < 2) return;
    this.text(x, y, '┌' + '─'.repeat(width - 2) + '┐', style);
    this.text(x, y + height - 1, '└' + '─'.repeat(width - 2) + '┘', style);
    for (let row = y + 1; row < y + height - 1; row++) {
      this.text(x, row, '│', style);
      this.text(x + width - 1, row, '│', style);
    }
  }
  copy(source: TerminalCanvas, x: number, y: number, sourceTop: number, height: number): void {
    const copied = Array.from({ length: Math.max(0, height) }, (_, row) =>
      source.cells[sourceTop + row]?.slice()
    );
    for (let row = 0; row < height; row++) {
      const cells = copied[row];
      if (y + row < 0 || y + row >= this.height || !cells) continue;
      this.fill(x, y + row, source.width, 1);
      for (let col = 0; col < cells.length && x + col < this.width; col++) {
        const cell = cells[col];
        if (cell.width && x + col >= 0 && x + col + cell.width <= this.width) {
          for (let index = 0; index < cell.width; index++)
            this.cells[y + row][x + col + index] = cells[col + index];
        }
      }
    }
  }
  lines(colorDepth = 24): string[] {
    const escapes = new Map<string, string>();
    return this.cells.map((row) => {
      let output = '',
        previous = '';
      for (const cell of row) {
        if (!cell.width) continue;
        if (colorDepth > 1) {
          const key = cell.style.fg + ':' + cell.style.bg + ':' + cell.style.bold;
          let escape = escapes.get(key);
          if (!escape) {
            escape = cellEscape(cell.style, colorDepth);
            escapes.set(key, escape);
          }
          if (escape !== previous) {
            output += escape;
            previous = escape;
          }
        }
        output += cell.text;
      }
      return output + (colorDepth > 1 ? '\x1b[0m' : '');
    });
  }
  decorateBackground(sample: (x: number, y: number) => { text: string; fg: string } | null): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const cell = this.cells[y][x];
        if (cell.painted || cell.width !== 1 || cell.style.bg !== this.background) continue;
        const value = sample(x, y);
        if (value) {
          if (cell.text !== value.text || cell.style.fg !== value.fg)
            this.cells[y][x] = {
              text: value.text,
              width: 1,
              style: { fg: value.fg, bg: this.background },
            };
        } else this.cells[y][x] = this.blank;
      }
    }
  }
  clone(): TerminalCanvas {
    const copy = new TerminalCanvas(this.width, this.height, this.background);
    copy.cells = this.cells.map((row) => row.slice());
    return copy;
  }
  diff(previous?: TerminalCanvas): TerminalRect[] {
    if (!previous || previous.width !== this.width || previous.height !== this.height)
      return [{ x: 0, y: 0, columns: this.width, rows: this.height }];
    const result: TerminalRect[] = [];
    const same = (a: Cell, b: Cell) =>
      a === b ||
      (a.text === b.text &&
        a.width === b.width &&
        a.style.fg === b.style.fg &&
        a.style.bg === b.style.bg &&
        !!a.style.bold === !!b.style.bold);
    for (let y = 0; y < this.height; y++) {
      const rowStart = result.length;
      let start = -1;
      for (let x = 0; x <= this.width; x++) {
        if (x < this.width && !same(this.cells[y][x], previous.cells[y][x])) {
          if (start < 0) start = x;
        } else if (start >= 0) {
          while (
            start > 0 &&
            (this.cells[y][start].width === 0 || previous.cells[y][start].width === 0)
          )
            start--;
          let end = x;
          while (
            end < this.width &&
            (this.cells[y][end].width === 0 || previous.cells[y][end].width === 0)
          )
            end++;
          const last = result.at(-1);
          if (last?.y === y && last.x + last.columns >= start)
            last.columns = Math.max(last.columns, end - last.x);
          else result.push({ x: start, y, columns: end - start, rows: 1 });
          start = -1;
        }
      }
      if (
        result.length > rowStart &&
        (this.cells[y].some((cell) => cell.uncertainWidth) ||
          previous.cells[y].some((cell) => cell.uncertainWidth))
      ) {
        result.splice(rowStart, result.length - rowStart, {
          x: 0,
          y,
          columns: this.width,
          rows: 1,
        });
      }
    }
    return result;
  }
  paint(rects: readonly TerminalRect[], colorDepth = 24, offset = { x: 0, y: 0 }): string {
    if (!rects.length) return '';
    const escapes = new Map<string, string>();
    const uncertainRows = new Map<number, boolean>();
    let output = '';
    for (const rect of rects) {
      for (let y = Math.max(0, rect.y); y < Math.min(this.height, rect.y + rect.rows); y++) {
        let left = Math.max(0, rect.x);
        let right = Math.min(this.width, rect.x + rect.columns);
        if (right <= left) continue;
        let uncertainWidth = uncertainRows.get(y);
        if (uncertainWidth === undefined) {
          uncertainWidth = this.cells[y].some((cell) => cell.uncertainWidth);
          uncertainRows.set(y, uncertainWidth);
        }
        if (uncertainWidth) {
          left = 0;
          right = this.width;
        }
        while (left > 0 && this.cells[y][left].width === 0) left--;
        while (right < this.width && this.cells[y][right].width === 0) right++;
        output += `\x1b[${y + offset.y + 1};${left + offset.x + 1}H`;
        if (uncertainWidth)
          output +=
            (colorDepth > 1 ? cellEscape(this.blank.style, colorDepth) : '\x1b[0m') +
            `\x1b[${right - left}X`;
        let previous = '';
        for (let x = left; x < right; x++) {
          const cell = this.cells[y][x];
          if (!cell.width) continue;
          if (colorDepth > 1) {
            const key = cell.style.fg + ':' + cell.style.bg + ':' + cell.style.bold;
            if (key !== previous) {
              let escape = escapes.get(key);
              if (!escape) {
                escape = cellEscape(cell.style, colorDepth);
                escapes.set(key, escape);
              }
              output += escape;
              previous = key;
            }
          }
          output += cell.text;
        }
      }
    }
    return output ? '\x1b[?7l' + output + '\x1b[0m\x1b[?7h' : '';
  }
}

function cellEscape(style: CellStyle, depth: number): string {
  const values = [0, ...(style.bold ? [1] : [])];
  for (const [key, prefix] of [
    ['fg', 38],
    ['bg', 48],
  ] as const) {
    const hex = style[key];
    if (!hex) continue;
    const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
    if (depth >= 24) values.push(prefix, 2, ...channels);
    else if (depth >= 8) {
      const [r, g, b] = channels;
      const index =
        r === g && g === b
          ? r < 8
            ? 16
            : r > 248
              ? 231
              : Math.min(255, Math.round((r - 8) / 10) + 232)
          : 16 +
            36 * Math.round((r / 255) * 5) +
            6 * Math.round((g / 255) * 5) +
            Math.round((b / 255) * 5);
      values.push(prefix, 5, index);
    } else values.push(prefix === 38 ? 37 : 40);
  }
  return '\x1b[' + values.join(';') + 'm';
}

export function paintTerminal(lines: string[], previous: string[] = []): string {
  let output = '';
  lines.forEach((line, index) => {
    if (line !== previous[index]) output += `\x1b[${index + 1};1H` + line;
  });
  return output ? '\x1b[?7l' + output + '\x1b[?7h' : '';
}
