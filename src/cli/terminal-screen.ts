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
}
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function plainText(value: string): string {
  return stripVTControlCharacters(value).replace(/[\x00-\x1f\x7f-\x9f]/g, '');
}
export function textWidth(value: string): number {
  return stringWidth(plainText(value));
}
export function fitText(value: string, width: number, ellipsis = true): string {
  const clean = plainText(value);
  if (width <= 0) return '';
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
  constructor(
    width: number,
    height: number,
    readonly background = THEME.background
  ) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.cells = Array.from({ length: this.height }, () =>
      Array.from({ length: this.width }, () => ({
        text: ' ',
        width: 1,
        style: { fg: THEME.text, bg: background },
      }))
    );
  }
  text(
    x: number,
    y: number,
    value: string,
    style: CellStyle = {},
    maxWidth = this.width - x
  ): void {
    if (y < 0 || y >= this.height || maxWidth <= 0) return;
    let col = x;
    for (const { segment } of graphemes.segment(plainText(value))) {
      const size = stringWidth(segment);
      if (!size) continue;
      if (col + size > x + maxWidth || col + size > this.width) break;
      if (col >= 0) {
        for (let i = 0; i < size; i++) this.clearCell(col + i, y);
        this.cells[y][col] = {
          text: segment,
          width: size,
          painted: true,
          style: { fg: THEME.text, bg: this.background, ...style },
        };
        for (let i = 1; i < size; i++) this.cells[y][col + i] = { text: '', width: 0, style };
      }
      col += size;
    }
  }
  private clearCell(x: number, y: number): void {
    let start = x;
    while (start > 0 && this.cells[y][start].width === 0) start--;
    const end = Math.min(this.width, start + Math.max(1, this.cells[y][start].width));
    for (let col = start; col < end; col++)
      this.cells[y][col] = { text: ' ', width: 1, style: { fg: THEME.text, bg: this.background } };
  }
  fill(
    x: number,
    y: number,
    width: number,
    height: number,
    style: CellStyle = {},
    character = ' '
  ): void {
    for (let row = Math.max(0, y); row < Math.min(this.height, y + height); row++) {
      this.text(
        Math.max(0, x),
        row,
        character.repeat(Math.max(0, Math.min(this.width, x + width) - Math.max(0, x))),
        style
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
    return this.cells.map((row) => {
      let output = '',
        previous = '';
      for (const cell of row) {
        if (!cell.width) continue;
        if (colorDepth > 1) {
          const escape = cellEscape(cell.style, colorDepth);
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
        if (
          cell.painted ||
          cell.width !== 1 ||
          cell.text !== ' ' ||
          cell.style.bg !== this.background
        )
          continue;
        const value = sample(x, y);
        if (value) this.text(x, y, value.text, { fg: value.fg });
      }
    }
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
  let output = '\x1b[?7l';
  lines.forEach((line, index) => {
    if (line !== previous[index]) output += `\x1b[${index + 1};1H` + line;
  });
  return output + '\x1b[?7h';
}
