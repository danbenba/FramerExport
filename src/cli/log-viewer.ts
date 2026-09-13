import { spawn } from 'node:child_process';
import path from 'node:path';
import { stdin, stdout } from 'node:process';
import {
  getLogHistory,
  onLog,
  retainLogHistory,
  suspendConsoleOutput,
  type LogRecord,
} from '../logger/index.js';
import { getProgress, onProgress, type ExportProgress } from '../exporter/progress.js';
import { RawInput, type InputEvent } from './input.js';
import { TerminalCanvas, fitText, plainText, textWidth } from './terminal-screen.js';
import { THEME } from './theme.js';
import { readPreferences } from './preferences.js';

type LogFilter = 'all' | 'warnings' | 'errors';
type ViewerAction = 'close' | 'copy' | undefined;
interface ViewerRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface LogViewerLayout {
  canvas: TerminalCanvas;
  regions: ViewerRegion[];
  bodyTop: number;
  bodyHeight: number;
  visibleCount: number;
  maximumScroll: number;
}
export interface LogViewerOptions {
  title?: string;
  outDir?: string;
  reduceMotion?: boolean;
}

const LOG_COLORS = {
  log: THEME.secondary,
  info: THEME.info,
  warn: THEME.warning,
  error: THEME.error,
  ok: THEME.success,
};

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
function cellSlice(value: string, offset: number, width: number): string {
  if (width <= 0) return '';
  const clean = plainText(value);
  if (/^[\x20-\x7e]*$/.test(clean)) return clean.slice(offset, offset + width);
  let skipped = 0;
  let result = '';
  let used = 0;
  for (const { segment } of graphemes.segment(clean)) {
    const size = textWidth(segment);
    if (skipped < offset) {
      skipped += size;
      continue;
    }
    if (used + size > width) break;
    result += segment;
    used += size;
  }
  return result;
}

export function formatLogRecords(records: readonly LogRecord[]): string {
  return records
    .map((record) => `[${record.time}] [${record.level}] ${plainText(record.message)}`)
    .join('\n');
}

export class LogViewerModel {
  readonly records: LogRecord[];
  query = '';
  searching = false;
  filter: LogFilter = 'all';
  follow = true;
  scroll = 0;
  horizontal = 0;
  complete = false;
  failure = '';
  notice = '';
  hover = '';
  animationTime = 0;
  progress: Readonly<ExportProgress> = { ...getProgress() };
  private lastLayout?: LogViewerLayout;
  private dragging = false;
  private selectAll = false;
  private filterQuery: string | undefined;
  private filterLevel: LogFilter | undefined;
  private filteredCount = 0;
  private filteredRecords: Array<{ record: LogRecord; line: number }> = [];
  private searchable = new WeakMap<LogRecord, string>();

  constructor(
    records: readonly LogRecord[] = [],
    readonly options: LogViewerOptions = {}
  ) {
    this.records = records.map((record) => ({ ...record }));
  }

  append(record: LogRecord): void {
    this.records.push({ ...record });
  }

  filtered(): Array<{ record: LogRecord; line: number }> {
    const query = this.query.toLowerCase();
    if (
      this.filterQuery !== query ||
      this.filterLevel !== this.filter ||
      this.filteredCount > this.records.length
    ) {
      this.filterQuery = query;
      this.filterLevel = this.filter;
      this.filteredCount = 0;
      this.filteredRecords = [];
    }
    for (let index = this.filteredCount; index < this.records.length; index++) {
      const record = this.records[index];
      if (this.filter === 'errors' && record.level !== 'error') continue;
      if (this.filter === 'warnings' && record.level !== 'warn' && record.level !== 'error')
        continue;
      if (query) {
        let searchable = this.searchable.get(record);
        if (searchable === undefined) {
          searchable = `${record.time} ${record.level} ${plainText(record.message)}`.toLowerCase();
          this.searchable.set(record, searchable);
        }
        if (!searchable.includes(query)) continue;
      }
      this.filteredRecords.push({ record, line: index + 1 });
    }
    this.filteredCount = this.records.length;
    return this.filteredRecords;
  }

  activate(id: string): ViewerAction {
    if (id === 'close' || id === 'copy') return id;
    if (id === 'search') {
      this.searching = true;
      this.selectAll = true;
    } else if (id === 'filter') {
      this.filter =
        this.filter === 'all' ? 'warnings' : this.filter === 'warnings' ? 'errors' : 'all';
      this.scroll = 0;
    } else if (id === 'follow') this.follow = !this.follow;
    return undefined;
  }

  handle(event: InputEvent): ViewerAction {
    const layout = this.lastLayout;
    if (!layout) return undefined;
    if (event.type === 'mouse') {
      if (event.kind === 'wheel-up' || event.kind === 'wheel-down') {
        this.move(event.kind === 'wheel-up' ? -3 : 3);
        return undefined;
      }
      const x = event.x - 1;
      const y = event.y - 1;
      const region = layout.regions.find(
        (item) => x >= item.x && x < item.x + item.width && y >= item.y && y < item.y + item.height
      );
      this.hover = region?.id || '';
      if (
        (this.dragging && (event.kind === 'move' || event.kind === 'click')) ||
        (region?.id === 'scrollbar' && (event.kind === 'press' || event.kind === 'click'))
      ) {
        this.follow = false;
        this.scroll = Math.round(
          Math.max(0, Math.min(1, (y - layout.bodyTop) / Math.max(1, layout.bodyHeight - 1))) *
            layout.maximumScroll
        );
        this.dragging = event.kind !== 'click';
      } else if (event.kind === 'click' && region) return this.activate(region.id);
      return undefined;
    }
    this.hover = '';
    if (event.type === 'key' && event.name === 'ctrl-c') return 'close';
    if (this.searching) {
      if (event.type === 'paste' || event.type === 'char') {
        const value = event.type === 'paste' ? event.text : event.char;
        this.query = fitText((this.selectAll ? '' : this.query) + plainText(value), 256, false);
        this.selectAll = false;
        this.scroll = 0;
      } else if (event.type === 'key') {
        if (event.name === 'return' || event.name === 'escape') this.searching = false;
        else if (event.name === 'ctrl-a') this.selectAll = true;
        else if (event.name === 'ctrl-u') this.query = '';
        else if (event.name === 'backspace' || event.name === 'delete') {
          const segments = [...graphemes.segment(this.query)];
          this.query = this.selectAll ? '' : this.query.slice(0, segments.at(-1)?.index ?? 0);
          this.selectAll = false;
        }
      }
      return undefined;
    }
    if (event.type === 'char') {
      if (event.char === '/') return this.activate('search');
      if (event.char === 'f') return this.activate('filter');
      if (event.char === 'p' || event.char === ' ') return this.activate('follow');
      if (event.char === 'c') return 'copy';
      return undefined;
    }
    if (event.type !== 'key') return undefined;
    if (event.name === 'escape') return 'close';
    if (event.name === 'return' && this.complete) return 'close';
    if (event.name === 'up') this.move(-1);
    else if (event.name === 'down') this.move(1);
    else if (event.name === 'page-up') this.move(-layout.bodyHeight);
    else if (event.name === 'page-down') this.move(layout.bodyHeight);
    else if (event.name === 'home') {
      this.follow = false;
      this.scroll = 0;
    } else if (event.name === 'end') this.follow = true;
    else if (event.name === 'left') this.horizontal = Math.max(0, this.horizontal - 8);
    else if (event.name === 'right') this.horizontal += 8;
    return undefined;
  }

  private move(amount: number): void {
    this.follow = false;
    this.scroll = Math.max(0, Math.min(this.lastLayout?.maximumScroll || 0, this.scroll + amount));
  }

  phaseCanvas(columns: number, time = this.animationTime): TerminalCanvas {
    const canvas = new TerminalCanvas(columns, 1);
    const margin = columns >= 30 ? 2 : 0;
    const width = Math.max(1, columns - margin * 2 - (columns > 1 ? 1 : 0));
    const phase = fitText(
      this.complete ? this.failure || 'Export finished' : this.progress.phase || 'Starting export',
      width
    );
    if (this.complete || this.options.reduceMotion) {
      canvas.text(margin, 0, phase, {
        fg: this.failure ? THEME.error : this.complete ? THEME.success : '#B5B5B5',
      });
      return canvas;
    }
    const angle = (120 * Math.PI) / 180;
    const span = Math.max(1, textWidth(phase)) * Math.sin(angle);
    const sweep = (((time % 2000) / 2000) * 2 - 0.5) * span;
    let x = margin;
    for (const { segment } of graphemes.segment(phase)) {
      const distance = Math.abs((x - margin) * Math.sin(angle) - sweep);
      const brightness = Math.max(0, 1 - distance / Math.max(1, span * 0.18));
      const channel = Math.round(181 + brightness * 74)
        .toString(16)
        .padStart(2, '0');
      canvas.text(x, 0, segment, { fg: '#' + channel.repeat(3) });
      x += textWidth(segment);
    }
    return canvas;
  }

  render(columns: number, rows: number): LogViewerLayout {
    const canvas = new TerminalCanvas(columns, rows);
    columns = canvas.width;
    rows = canvas.height;
    const margin = columns >= 30 ? 2 : 0;
    const width = Math.max(1, columns - margin * 2 - (columns > 1 ? 1 : 0));
    const header = rows >= 24 ? 7 : rows >= 12 ? 4 : rows >= 6 ? 2 : rows >= 3 ? 1 : 0;
    const footer = rows >= 24 ? 4 : rows >= 12 ? 3 : rows >= 4 ? 1 : 0;
    const bodyHeight = Math.max(1, rows - header - footer);
    const regions: ViewerRegion[] = [];
    const filtered = this.filtered();
    const maximumScroll = Math.max(0, filtered.length - bodyHeight);
    this.scroll = this.follow ? maximumScroll : Math.max(0, Math.min(maximumScroll, this.scroll));
    const status = this.complete ? (this.failure ? 'FAILED' : 'COMPLETE') : 'RUNNING';
    const statusColor = this.failure ? THEME.error : this.complete ? THEME.success : THEME.primary;
    const button = (id: string, label: string, x: number, y: number) => {
      const size = Math.min(textWidth(label) + 2, columns - x - margin);
      if (size < 1) return;
      canvas.text(x, y, fitText(' ' + label + ' ', size), {
        fg: this.hover === id ? THEME.primary : THEME.text,
        bg: this.hover === id ? THEME.border : THEME.element,
      });
      regions.push({ id, x, y, width: size, height: 1 });
    };
    if (header) {
      canvas.text(margin, 0, fitText(this.options.title || 'Export logs', width), { bold: true });
      if (columns >= 38)
        canvas.text(columns - margin - status.length - 1, 0, status, {
          fg: statusColor,
          bold: true,
        });
      if (header >= 2) {
        canvas.copy(this.phaseCanvas(columns, this.animationTime), 0, 1, 0, 1);
      }
      if (header >= 6)
        canvas.text(
          margin,
          2,
          fitText(
            this.options.outDir ? path.join(this.options.outDir, 'export.log') : 'export.log',
            width
          ),
          { fg: THEME.muted }
        );
      if (header >= 4) {
        let x = margin;
        for (const [id, label] of [
          ['search', this.query ? 'Search: ' + fitText(this.query, 18) : '/ Search'],
          ['filter', 'Filter: ' + this.filter],
          ['follow', this.follow ? 'Following' : 'Latest logs'],
          ['copy', 'Copy all'],
        ]) {
          if (x + textWidth(label) + 2 > columns - margin) break;
          button(id, label, x, header >= 7 ? header - 3 : header - 2);
          x += textWidth(label) + 4;
        }
        canvas.text(margin, header >= 7 ? header - 2 : header - 1, '─'.repeat(width), {
          fg: THEME.border,
        });
      }
    }
    const numberWidth = columns >= 20 ? String(this.records.length || 1).length + 2 : 0;
    const timeWidth = columns >= 64 ? 10 : 0;
    const levelWidth = columns >= 38 ? 8 : 0;
    const messageX = margin + numberWidth + timeWidth + levelWidth;
    filtered.slice(this.scroll, this.scroll + bodyHeight).forEach(({ record, line }, index) => {
      const y = header + index;
      const color = LOG_COLORS[record.level];
      if (numberWidth)
        canvas.text(margin, y, String(line).padStart(numberWidth - 2), { fg: THEME.muted });
      if (timeWidth) canvas.text(margin + numberWidth, y, record.time, { fg: THEME.muted });
      if (levelWidth)
        canvas.text(margin + numberWidth + timeWidth, y, record.level.toUpperCase(), { fg: color });
      canvas.text(
        messageX,
        y,
        cellSlice(record.message, this.horizontal, width - numberWidth - timeWidth - levelWidth),
        { fg: color }
      );
    });
    if (!filtered.length)
      canvas.text(
        margin,
        header,
        fitText(
          this.records.length ? 'No matching log entries' : 'Waiting for export logs…',
          width
        ),
        { fg: THEME.muted }
      );
    if (maximumScroll && columns > 1) {
      const thumb = Math.max(1, Math.floor((bodyHeight * bodyHeight) / filtered.length));
      const start = Math.round((this.scroll / maximumScroll) * (bodyHeight - thumb));
      for (let row = 0; row < bodyHeight; row++)
        canvas.text(columns - 1, header + row, row >= start && row < start + thumb ? '█' : '│', {
          fg: row >= start && row < start + thumb ? THEME.primary : THEME.border,
        });
      regions.push({ id: 'scrollbar', x: columns - 1, y: header, width: 1, height: bodyHeight });
    }
    if (footer) {
      if (footer >= 3) {
        const counts = `${this.progress.downloaded}/${this.progress.totalAssets || '?'} downloaded · ${this.progress.failed} failed · ${this.progress.written} files`;
        canvas.text(margin, rows - 3, fitText(counts, width), { fg: THEME.muted });
        const position = `${filtered.length ? this.scroll + 1 : 0}–${Math.min(filtered.length, this.scroll + bodyHeight)} of ${filtered.length} · ${this.records.length} total`;
        canvas.text(
          margin,
          rows - 2,
          fitText(
            this.notice || position + (this.horizontal ? ' · column ' + (this.horizontal + 1) : ''),
            width
          ),
          { fg: THEME.muted }
        );
      }
      if (this.searching) {
        canvas.fill(0, rows - 1, columns, 1, { bg: THEME.element });
        canvas.text(margin, rows - 1, fitText('/ ' + this.query + '▏', width), {
          fg: THEME.primary,
          bg: THEME.element,
        });
      } else {
        const label = this.complete ? 'Enter Close' : 'Esc Console';
        button('close', label, margin, rows - 1);
        const x = margin + textWidth(label) + 3;
        if (columns - x > 12)
          canvas.text(
            x,
            rows - 1,
            fitText(
              '/ Search · f Filter · p ' +
                (this.follow ? 'Pause' : 'Follow') +
                ' · c Copy · ←→ Pan',
              columns - x
            ),
            { fg: THEME.muted }
          );
      }
    }
    const layout = {
      canvas,
      regions,
      bodyTop: header,
      bodyHeight,
      visibleCount: filtered.length,
      maximumScroll,
    };
    this.lastLayout = layout;
    return layout;
  }
}

async function copyLog(text: string): Promise<void> {
  const commands =
    process.platform === 'win32'
      ? [
          {
            command: 'clip.exe',
            args: [],
            input: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]),
          },
        ]
      : process.platform === 'darwin'
        ? [{ command: 'pbcopy', args: [], input: Buffer.from(text) }]
        : ['wl-copy', 'xclip', 'xsel'].map((command) => ({
            command,
            args:
              command === 'xclip'
                ? ['-selection', 'clipboard']
                : command === 'xsel'
                  ? ['--clipboard', '--input']
                  : [],
            input: Buffer.from(text),
          }));
  for (const item of commands) {
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(item.command, item.args, {
          stdio: ['pipe', 'ignore', 'ignore'],
          shell: false,
          windowsHide: true,
        });
        let settled = false;
        const finish = (error?: Error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) {
            child.kill();
            reject(error);
          } else resolve();
        };
        const timer = setTimeout(() => finish(new Error('Clipboard timed out')), 3000);
        child.once('error', finish);
        child.once('close', (code) =>
          finish(code === 0 ? undefined : new Error('Clipboard is unavailable'))
        );
        child.stdin.once('error', finish);
        child.stdin.end(item.input);
      });
      return;
    } catch {}
  }
  throw new Error('Clipboard unavailable; the full log is saved in export.log.');
}

export async function runWithLogViewer<T>(
  operation: () => Promise<T>,
  options: LogViewerOptions = {}
): Promise<T> {
  if (!stdin.isTTY || !stdout.isTTY || process.env.TERM === 'dumb') return operation();
  const releaseHistory = retainLogHistory();
  const restoreOutput = suspendConsoleOutput();
  const model = new LogViewerModel(getLogHistory(), {
    ...options,
    reduceMotion: options.reduceMotion ?? readPreferences().reduceMotion,
  });
  const depth = process.env.NO_COLOR !== undefined ? 1 : stdout.getColorDepth?.() || 8;
  let previousCanvas: TerminalCanvas | undefined;
  let previousPhase: TerminalCanvas | undefined;
  let closed = false;
  let dirty = true;
  let copying = false;
  let renderTimer: NodeJS.Timeout | undefined;
  let animationTimer: NodeJS.Timeout | undefined;
  const startedAt = performance.now();
  let resolveClosed!: () => void;
  const closedPromise = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  const draw = () => {
    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = undefined;
    if (closed || !dirty) return;
    model.animationTime = performance.now() - startedAt;
    const canvas = model.render(stdout.columns || 80, stdout.rows || 24).canvas;
    const output = canvas.paint(canvas.diff(previousCanvas), depth);
    if (output) stdout.write(output);
    previousCanvas = canvas;
    previousPhase = new TerminalCanvas(canvas.width, 1);
    previousPhase.copy(canvas, 0, 0, 1, 1);
    dirty = false;
    scheduleAnimation();
  };
  const scheduleRender = () => {
    if (closed) return;
    dirty = true;
    if (!renderTimer) renderTimer = setTimeout(draw, 16);
  };
  const scheduleAnimation = () => {
    if (
      closed ||
      model.complete ||
      model.options.reduceMotion ||
      depth <= 1 ||
      (stdout.rows || 24) < 6 ||
      animationTimer
    )
      return;
    animationTimer = setTimeout(() => {
      animationTimer = undefined;
      if (closed || model.complete) return;
      if (dirty) draw();
      else {
        const phase = model.phaseCanvas(stdout.columns || 80, performance.now() - startedAt);
        const output = phase.paint(phase.diff(previousPhase), depth, { x: 0, y: 1 });
        if (output) stdout.write(output);
        previousPhase = phase;
        previousCanvas?.copy(phase, 0, 1, 0, 1);
      }
      scheduleAnimation();
    }, 80);
  };
  const resize = () => {
    previousCanvas = undefined;
    previousPhase = undefined;
    if (animationTimer) clearTimeout(animationTimer);
    animationTimer = undefined;
    dirty = true;
    draw();
  };
  const offLog = onLog((record) => {
    model.append(record);
    scheduleRender();
  });
  const offProgress = onProgress((progress) => {
    model.progress = { ...progress };
    scheduleRender();
  });
  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (renderTimer) clearTimeout(renderTimer);
    if (animationTimer) clearTimeout(animationTimer);
    input.stop();
    stdout.off('resize', resize);
    process.off('SIGTERM', terminate);
    offLog();
    offProgress();
    restoreOutput();
    stdout.write('\x1b[?2004l\x1b[?1006l\x1b[?1003l\x1b[?7h\x1b[0m\x1b[?25h\x1b[?1049l');
    resolveClosed();
  };
  const terminate = () => {
    cleanup();
    process.kill(process.pid, 'SIGTERM');
  };
  const input = new RawInput((event) => {
    const previousHover = model.hover;
    const previousScroll = model.scroll;
    const action = model.handle(event);
    if (
      event.type === 'mouse' &&
      event.kind === 'move' &&
      previousHover === model.hover &&
      previousScroll === model.scroll
    )
      return;
    if (action === 'close') {
      cleanup();
      if (!model.complete)
        console.log('Export continues in the console. Press Ctrl+C again to stop.');
    } else if (action === 'copy' && !copying) {
      copying = true;
      model.notice = 'Copying log…';
      void copyLog(formatLogRecords(model.records))
        .then(
          () => {
            model.notice = `${model.records.length} log entries copied`;
          },
          (error) => {
            model.notice = error.message;
          }
        )
        .finally(() => {
          copying = false;
          scheduleRender();
        });
    }
    dirty = true;
    draw();
  });
  try {
    stdout.write('\x1b[?1049h\x1b[?25l\x1b[?1003h\x1b[?1006h\x1b[?2004h');
    stdout.on('resize', resize);
    process.once('SIGTERM', terminate);
    input.start();
    draw();
    let value!: T;
    let failure: unknown;
    let failed = false;
    try {
      value = await operation();
    } catch (error) {
      failed = true;
      failure = error;
      model.failure = error instanceof Error ? error.message : String(error);
      model.append({
        time: new Date().toISOString().slice(11, 19),
        level: 'error',
        message: model.failure,
      });
    }
    model.complete = true;
    if (animationTimer) clearTimeout(animationTimer);
    animationTimer = undefined;
    if (options.outDir) model.notice = 'Log: ' + path.join(options.outDir, 'export.log');
    dirty = true;
    draw();
    if (closed && !failed)
      console.log(
        'Export complete.' +
          (options.outDir ? ' Log: ' + path.join(options.outDir, 'export.log') : '')
      );
    await closedPromise;
    if (failed) throw failure;
    return value;
  } finally {
    cleanup();
    releaseHistory();
  }
}
