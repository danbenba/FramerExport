import chalk from 'chalk';
import { stdout } from 'node:process';
import { THEME, stripAnsi, ui } from './theme.js';
import { onProgress, getProgress, type ExportProgress } from '../exporter/progress.js';
import { setMessageWidth, setRenderHook } from '../logger/index.js';

const SIDEBAR_WIDTH = 40;
const MIN_COLUMNS = 100;
const TOP_ROW = 2;

function leftTruncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return '…' + text.slice(-(max - 1));
}

function row(content: string = ''): string {
  const visible = stripAnsi(content).length;
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

  start(): void {
    const columns = stdout.columns || 0;
    if (!stdout.isTTY || columns < MIN_COLUMNS) return;
    this.active = true;
    setMessageWidth(Math.max(40, columns - SIDEBAR_WIDTH - 22));
    setRenderHook(() => this.draw(true));
    this.unsubscribeProgress = onProgress(() => this.draw(false));
    this.timer = setInterval(() => this.draw(true), 1000);
    this.draw(true);
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    setMessageWidth(null);
    setRenderHook(null);
    this.unsubscribeProgress?.();
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
    if (columns < MIN_COLUMNS) return;
    const col = columns - SIDEBAR_WIDTH + 1;
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
      for (const file of p.recentFiles) {
        lines.push(row(`  ${ui.muted(leftTruncate(file, SIDEBAR_WIDTH - 4))}`));
      }
    }
    lines.push(row());

    this.height = Math.max(this.height, lines.length);
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
    if (columns < MIN_COLUMNS) return;
    const col = columns - SIDEBAR_WIDTH + 1;
    stdout.write('\x1B7');
    for (let index = 0; index < this.height; index++) {
      stdout.write(`\x1B[${TOP_ROW + index};${col}H${' '.repeat(SIDEBAR_WIDTH)}`);
    }
    stdout.write('\x1B8');
  }
}
