export interface ExportProgress {
  phase: string;
  startedAt: number;
  totalAssets: number;
  downloaded: number;
  failed: number;
  written: number;
  subpages: number;
  recentFiles: string[];
}

export type ProgressListener = (progress: ExportProgress) => void;

const RECENT_LIMIT = 10;

const state: ExportProgress = {
  phase: '',
  startedAt: 0,
  totalAssets: 0,
  downloaded: 0,
  failed: 0,
  written: 0,
  subpages: 0,
  recentFiles: [],
};

const listeners = new Set<ProgressListener>();

function emit(): void {
  for (const listener of listeners) listener(state);
}

export function onProgress(listener: ProgressListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getProgress(): Readonly<ExportProgress> {
  return state;
}

export function resetProgress(): void {
  state.phase = '';
  state.startedAt = Date.now();
  state.totalAssets = 0;
  state.downloaded = 0;
  state.failed = 0;
  state.written = 0;
  state.subpages = 0;
  state.recentFiles = [];
  emit();
}

export function setPhase(phase: string): void {
  state.phase = phase;
  emit();
}

export function setTotalAssets(total: number): void {
  state.totalAssets = total;
  emit();
}

export function noteDownload(ok: boolean): void {
  if (ok) state.downloaded++;
  else state.failed++;
  emit();
}

export function noteFile(relPath: string): void {
  state.written++;
  state.recentFiles.push(relPath.replace(/\\/g, '/'));
  if (state.recentFiles.length > RECENT_LIMIT) state.recentFiles.shift();
  emit();
}

export function noteSubpage(): void {
  state.subpages++;
  emit();
}
