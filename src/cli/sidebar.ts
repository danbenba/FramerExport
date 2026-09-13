import chalk from 'chalk';
import { stdout } from 'node:process';
import { THEME, ui } from './theme.js';
import { fitAnsi } from './box.js';
import { plainText, textWidth } from './terminal-screen.js';
import { onProgress, getProgress, type ExportProgress } from '../exporter/progress.js';
import { setMessageWidth, setRenderHook } from '../logger/index.js';

const SIDEBAR_WIDTH = 40;
const MIN_COLUMNS = 100;
const TOP_ROW = 2;
const MIN_ROWS = 16;

function leftTruncate(text: string, max: number): string {
  const clean = plainText(text);
  if (textWidth(clean) <= max) return clean;
  const segments = Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(clean),
    (part) => part.segment
  );
  let tail = '';
  for (const segment of segments.reverse()) {
    if (textWidth(segment + tail) > max - 1) break;
    tail = segment + tail;
  }
  return '…' + tail;
}

function row(content: string = ''): string {
  content = fitAnsi(content, SIDEBAR_WIDTH);
  const visible = textWidth(content);
  const pad = Math.max(0, SIDEBAR_WIDTH - visible);
  return chalk.bgHex(THEME.panel)(content + ' '.repeat(pad));
}

function formatElapsed(startedAt: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export class ExportSidebar {
  private active = false;
  private unsubscribeProgress: (() => void) | null = null;
  private timer: NodeJS.Timeout | null = null;
  private lastDraw = 0;
  private height = 0;
  private column = 0;
  private readonly resize = (): void => {
    this.clear();
    this.draw(true);
  };

  start(): void {
    if (this.active) this.stop();
    if (!stdout.isTTY) return;
    this.active = true;
    stdout.on('resize', this.resize);
    setRenderHook(() => this.draw(true));
    this.unsubscribeProgress = onProgress(() => this.draw(false));
    this.timer = setInterval(() => this.draw(true), 1000);
    this.draw(true);
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    stdout.off('resize', this.resize);
    setMessageWidth(null);
    setRenderHook(null);
    this.unsubscribeProgress?.();
    this.unsubscribeProgress = null;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.clear();
  }

  private draw(force: boolean): void {
    if (!this.active) return;
    const now = Date.now();
    if (!force && now - this.lastDraw < 80) return;
    this.lastDraw = now;

    const columns = stdout.columns || 0;
    const rows = stdout.rows || 0;
    if (!stdout.isTTY || columns < MIN_COLUMNS || rows < MIN_ROWS) {
      this.clear();
      setMessageWidth(null);
      return;
    }
    setMessageWidth(Math.max(0, columns - SIDEBAR_WIDTH - 22));
    const col = columns - SIDEBAR_WIDTH + 1;
    if (this.column && this.column !== col) this.clear();
    const p: Readonly<ExportProgress> = getProgress();

    const lines: string[] = [];
    lines.push(row());
    lines.push(row(`  ${ui.text.bold('Export')}`));
    lines.push(row(`  ${ui.muted(leftTruncate(p.phase || 'starting', SIDEBAR_WIDTH - 4))}`));
    lines.push(row(`  ${ui.muted(formatElapsed(p.startedAt) + ' elapsed')}`));
    lines.push(row());
    lines.push(row(`  ${ui.text.bold('Assets')}`));
    lines.push(
      row(
        `  ${ui.muted(`${p.downloaded}${p.totalAssets ? '/' + p.totalAssets : ''} downloaded`)}` +
          (p.failed > 0 ? `  ${ui.error(`${p.failed} failed`)}` : '')
      )
    );
    lines.push(row(`  ${ui.muted(`${p.written} files written`)}`));
    if (p.subpages > 0) lines.push(row(`  ${ui.muted(`${p.subpages} sub-pages`)}`));
    lines.push(row());
    lines.push(row(`  ${ui.text.bold('Files')}`));
    if (p.recentFiles.length === 0) {
      lines.push(row(`  ${ui.muted('waiting for output...')}`));
    } else {
      const capacity = Math.max(1, rows - TOP_ROW - lines.length - 1);
      for (const file of p.recentFiles.slice(-capacity)) {
        lines.push(row(`  ${ui.muted(leftTruncate(file, SIDEBAR_WIDTH - 4))}`));
      }
    }
    lines.push(row());

    this.height = Math.min(rows - TOP_ROW, Math.max(this.height, lines.length));
    this.column = col;
    stdout.write('\x1B7');
    lines.forEach((line, index) => {
      stdout.write(`\x1B[${TOP_ROW + index};${col}H${line}`);
    });
    for (let extra = lines.length; extra < this.height; extra++) {
      stdout.write(`\x1B[${TOP_ROW + extra};${col}H${' '.repeat(SIDEBAR_WIDTH)}`);
    }
    stdout.write('\x1B8');
  }

  private clear(): void {
    const columns = stdout.columns || 0;
    const rows = stdout.rows || 0;
    const col = this.column;
    const height = Math.max(0, Math.min(this.height, rows - TOP_ROW));
    const width = Math.max(0, Math.min(SIDEBAR_WIDTH, columns - col + 1));
    this.height = 0;
    this.column = 0;
    if (!stdout.isTTY || col < 1 || !height || !width) return;
    stdout.write('\x1B7');
    for (let index = 0; index < height; index++) {
      stdout.write(`\x1B[${TOP_ROW + index};${col}H${' '.repeat(width)}`);
    }
    stdout.write('\x1B8');
  }
}
