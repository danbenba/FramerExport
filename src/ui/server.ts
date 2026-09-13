import http from 'node:http';
import path from 'node:path';
import { URL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { UI_HTML } from './page.js';
import { APP_JS } from './app-js.js';
import { PIXEL_BLAST_JS } from './pixel-blast.js';
import { FramerExporter, deriveOutputName } from '../exporter/index.js';
import { collectSummary } from '../exporter/summary.js';
import {
  platformsByCategory,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  isBetaPlatform,
} from '../platforms/index.js';
import type { PlatformType } from '../platforms/types.js';
import {
  onLog,
  getLogHistory,
  clearLogHistory,
  retainLogHistory,
  suspendConsoleOutput,
} from '../logger/index.js';
import { onProgress, getProgress } from '../exporter/progress.js';
import { ui } from '../cli/theme.js';
import { providerPresentation } from '../platforms/presentation.js';
import {
  readPreferences,
  savePreferences,
  readDraft,
  saveDraft,
  resetPreferences,
  isProvider,
  type Preferences,
  type ExportDraft,
} from '../cli/preferences.js';

interface ExportRequest {
  url: string;
  platform?: string | null;
  outDir?: string;
  subpages?: boolean;
  prettyPrint?: boolean;
  concurrency?: number;
}

interface RunState {
  state: 'idle' | 'running' | 'done' | 'error';
  runId?: string;
  outDir?: string;
  serveCommand?: string;
  error?: string;
  summary?: Awaited<ReturnType<typeof collectSummary>>;
}

const clients = new Set<http.ServerResponse>();
let run: RunState = { state: 'idle' };

function isExportRunning(): boolean {
  return run.state === 'running';
}

function isAllowedHost(req: http.IncomingMessage): boolean {
  const host = (req.headers.host || '').toLowerCase();
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
}

function isSameOrigin(req: http.IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return (
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
      parsed.port === (req.headers.host || '').split(':')[1]
    );
  } catch {
    return false;
  }
}

function resolveOutDir(requested: string | undefined, fallbackName: string): string | null {
  const cwd = process.cwd();
  const target = path.resolve(cwd, requested || './' + fallbackName);
  if (target !== cwd && !target.startsWith(cwd + path.sep)) return null;
  return target;
}

function quoteForShell(name: string): string {
  const normalized = name.replace(/\\/g, '/');
  if (/["`$\r\n]/.test(normalized)) {
    return process.platform === 'win32'
      ? "'" + normalized.replace(/'/g, "''") + "'"
      : "'" + normalized.replace(/'/g, "'\\''") + "'";
  }
  return '"' + normalized + '"';
}

function sse(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) client.write(payload);
}

function json(res: http.ServerResponse, code: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function platformsPayload(): unknown {
  const grouped = platformsByCategory();
  const presentation = (id: string) => {
    const provider = providerPresentation(id);
    return {
      displayName: provider.name,
      description: provider.description,
      homepage: provider.homepage,
      color: provider.color,
      iconDataUri: provider.iconDataUri,
      iconBackground: provider.iconBackground,
    };
  };
  return {
    auto: { name: 'auto', ...presentation('auto'), beta: false, categoryLabel: 'Automatic' },
    categories: CATEGORY_ORDER.map((cat) => ({
      id: cat,
      label: CATEGORY_LABELS[cat],
      platforms: grouped[cat].map((h) => ({
        name: h.name,
        ...presentation(h.name),
        beta: isBetaPlatform(h.name),
      })),
    })),
  };
}

async function startExport(body: ExportRequest, outDir: string, runId: string): Promise<void> {
  run = { state: 'running', runId };
  clearLogHistory();
  sse('status', run);

  const { CFG } = await import('../config/index.js');
  CFG.concurrency = body.concurrency || 12;

  const exporter = new FramerExporter(
    body.url,
    outDir,
    body.platform === 'auto' ? undefined : (body.platform as PlatformType) || undefined
  );
  exporter.prettyPrint = body.prettyPrint !== false;
  exporter.interactive = false;
  exporter.terminalPresentation = false;

  const releaseHistory = retainLogHistory();
  const restoreOutput = suspendConsoleOutput();
  try {
    await exporter.run(body.subpages === true);
    run = {
      state: 'done',
      runId,
      outDir,
      serveCommand: `cd ${quoteForShell(outDir)} && node serve.js`,
      summary: await collectSummary(outDir),
    };
  } catch (e) {
    run = { state: 'error', runId, error: (e as Error).message };
  } finally {
    releaseHistory();
    restoreOutput();
  }
  sse('status', run);
}

export interface UiServerHandle {
  port: number;
  close: () => Promise<void>;
}

export interface UiServerOptions {
  quiet?: boolean;
  preferencesHome?: string;
}

export function startUiServer(
  port: number,
  options: UiServerOptions = {}
): Promise<UiServerHandle> {
  const preferenceOptions = { home: options.preferencesHome };
  const unsubscribeLog = onLog((record) => sse('log', record));
  const unsubscribeProgress = onProgress((progress) => sse('progress', progress));

  const server = http.createServer(async (req, res) => {
    const parsed = new URL(req.url || '/', 'http://localhost');
    const route = parsed.pathname;

    if (!isAllowedHost(req) || !isSameOrigin(req)) {
      json(res, 403, { error: 'forbidden' });
      return;
    }

    if (route === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(UI_HTML);
      return;
    }
    if (route === '/app.js' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end(APP_JS);
      return;
    }
    if (route === '/pixel-blast.js' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
      res.end(PIXEL_BLAST_JS);
      return;
    }
    if (route === '/api/platforms' && req.method === 'GET') {
      json(res, 200, platformsPayload());
      return;
    }
    if (route === '/api/preferences' && req.method === 'GET') {
      json(res, 200, readPreferences(preferenceOptions));
      return;
    }
    if (route === '/api/draft' && req.method === 'GET') {
      json(res, 200, { draft: readDraft(preferenceOptions) });
      return;
    }
    if (route === '/api/reset' && req.method === 'POST') {
      if (isExportRunning()) {
        json(res, 409, { error: 'Finish the current export before resetting the program.' });
        return;
      }
      try {
        const body: unknown = JSON.parse(await readBody(req));
        if (!body || typeof body !== 'object' || !('confirmed' in body) || body.confirmed !== true)
          throw new Error('Confirm the reset before continuing.');
        if (isExportRunning()) {
          json(res, 409, { error: 'Finish the current export before resetting the program.' });
          return;
        }
        const preferences = resetPreferences(preferenceOptions);
        run = { state: 'idle' };
        clearLogHistory();
        json(res, 200, preferences);
      } catch (error) {
        json(res, 400, { error: (error as Error).message });
      }
      return;
    }
    if ((route === '/api/preferences' || route === '/api/draft') && req.method === 'POST') {
      try {
        const body: unknown = JSON.parse(await readBody(req));
        if (!body || typeof body !== 'object' || Array.isArray(body))
          throw new Error('Expected an object');
        if (route === '/api/preferences') {
          json(res, 200, savePreferences(body as Partial<Preferences>, preferenceOptions));
        } else {
          saveDraft(body as ExportDraft, preferenceOptions);
          json(res, 200, { saved: true });
        }
      } catch (error) {
        json(res, 400, { error: (error as Error).message });
      }
      return;
    }
    if (route === '/api/derive' && req.method === 'GET') {
      const url = parsed.searchParams.get('url') || '';
      const platform = (parsed.searchParams.get('platform') as PlatformType) || null;
      try {
        const { detectPlatform } = await import('../platforms/index.js');
        const name = deriveOutputName(url, platform || detectPlatform(url).name);
        json(res, 200, { name });
      } catch {
        json(res, 400, { error: 'invalid url' });
      }
      return;
    }
    if (route === '/api/status' && req.method === 'GET') {
      json(res, 200, { run, progress: getProgress() });
      return;
    }
    if (route === '/api/log' && req.method === 'GET') {
      const text = getLogHistory()
        .map((r) => `[${r.time}] [${r.level}] ${r.message}`)
        .join('\n');
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(text + '\n');
      return;
    }
    if (route === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(`event: status\ndata: ${JSON.stringify(run)}\n\n`);
      res.write(`event: progress\ndata: ${JSON.stringify(getProgress())}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (route === '/api/export' && req.method === 'POST') {
      if (run.state === 'running') {
        json(res, 409, { error: 'an export is already running' });
        return;
      }
      let body: ExportRequest;
      try {
        body = JSON.parse(await readBody(req)) as ExportRequest;
        const source = new URL(body.url);
        if (!['http:', 'https:'].includes(source.protocol) || source.username || source.password) {
          throw new Error('Expected a public HTTP or HTTPS URL');
        }
        if (body.platform && !isProvider(body.platform)) throw new Error('Unknown provider');
        if (
          body.concurrency !== undefined &&
          (!Number.isInteger(body.concurrency) || body.concurrency < 1 || body.concurrency > 32)
        )
          throw new Error('Invalid concurrency');
        if (body.outDir !== undefined && typeof body.outDir !== 'string')
          throw new Error('Invalid output directory');
      } catch {
        json(res, 400, { error: 'invalid request body' });
        return;
      }
      const outDir = resolveOutDir(
        body.outDir,
        deriveOutputName(body.url, (body.platform as PlatformType) || 'unknown')
      );
      if (!outDir) {
        json(res, 400, { error: 'output directory must stay inside the working directory' });
        return;
      }
      const runId = randomUUID();
      json(res, 202, { started: true, runId });
      void startExport(body, outDir, runId);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end('{"error":"not found"}');
  });

  server.on('close', () => {
    unsubscribeLog();
    unsubscribeProgress();
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      if (!options.quiet) {
        console.log('');
        console.log(`  ${ui.text.bold('Framer Export UI')}`);
        console.log(`  ${ui.muted('Local')}   ${ui.primary(`http://localhost:${actualPort}`)}`);
        console.log(`  ${ui.muted('Stop')}    ${ui.primary('ctrl+c')}`);
        console.log('');
      }
      resolve({
        port: actualPort,
        close: () =>
          new Promise<void>((done) => {
            for (const client of clients) client.end();
            clients.clear();
            server.close(() => done());
          }),
      });
    });
  });
}
