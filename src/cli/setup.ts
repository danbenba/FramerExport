import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import path from 'node:path';
import { FramerExporter, deriveOutputName } from '../exporter/index.js';
import { detectPlatform, PLATFORM_REGISTRY } from '../platforms/index.js';
import type { PlatformType } from '../platforms/types.js';
import { CFG } from '../config/index.js';
import { runWizard, validSiteUrl } from './wizard.js';
import {
  readPreferences,
  savePreferences,
  readDraft,
  saveDraft,
  clearDraft,
  resetPreferences,
  type ExportDraft,
} from './preferences.js';
import { ui } from './theme.js';
import { showBanner } from './banner.js';
import { CompanionUi } from './companion-ui.js';
import { runWithLogViewer } from './log-viewer.js';

export async function runSetup(
  legacyMode = false,
  settingsOnly = false,
  fresh = false
): Promise<void> {
  if (legacyMode || !stdin.isTTY || !stdout.isTTY || process.env.TERM === 'dumb') {
    if (settingsOnly) {
      console.log(JSON.stringify(readPreferences(), null, 2));
      return;
    }
    await runLegacySetup();
    return;
  }
  const preferences = readPreferences();
  const companion = new CompanionUi();
  let uiAddress = '';
  if (preferences.launchUi && !settingsOnly) {
    try {
      uiAddress = await companion.start();
    } catch (error) {
      console.error((error as Error).message);
    }
  }
  try {
    const draft = await runWizard({
      preferences,
      draft: fresh ? null : readDraft(),
      settingsOnly,
      uiAddress,
      savePreferences: (patch) => {
        const next = savePreferences(patch);
        if (patch.launchUi === false) companion.stop();
        return next;
      },
      saveDraft: (draft) => saveDraft(draft),
      openUi: () => companion.start(),
      resetPreferences: () => {
        const defaults = resetPreferences();
        companion.stop();
        return defaults;
      },
    });
    if (!draft) return;
    await launchExport(draft, true);
    clearDraft();
  } finally {
    companion.stop();
  }
}

async function launchExport(draft: ExportDraft, viewer = false): Promise<void> {
  CFG.concurrency = draft.concurrency;
  const exporter = new FramerExporter(
    draft.siteUrl,
    path.resolve(draft.outDir),
    draft.provider === 'auto' || draft.provider === 'unknown' ? undefined : draft.provider
  );
  exporter.prettyPrint = draft.prettyPrint;
  if (viewer) {
    exporter.terminalPresentation = false;
    exporter.interactive = false;
    await runWithLogViewer(() => exporter.run(draft.includeSubpages), {
      outDir: path.resolve(draft.outDir),
    });
  } else await exporter.run(draft.includeSubpages);
}

async function runLegacySetup(): Promise<void> {
  showBanner();
  const prefs = readPreferences();
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const ask = async (label: string, fallback = ''): Promise<string> => {
    const answer = await rl.question(`${label}${fallback ? ' (' + fallback + ')' : ''}: `);
    return answer.trim() || fallback;
  };
  try {
    const choice = await ask('Provider id or auto', prefs.defaultProvider);
    let url = '';
    while (!validSiteUrl(url)) {
      url = await ask('Public website URL');
      if (!validSiteUrl(url)) console.log('Enter an http:// or https:// URL without credentials.');
    }
    const provider = PLATFORM_REGISTRY.some((item) => item.name === choice)
      ? (choice as PlatformType)
      : 'auto';
    const outDir = await ask(
      'Output folder',
      './' + deriveOutputName(url, provider === 'auto' ? detectPlatform(url).name : provider)
    );
    const prettyPrint =
      (await ask('Format JavaScript? y/n', prefs.prettyPrint ? 'y' : 'n')).toLowerCase() === 'y';
    const includeSubpages =
      (await ask('Include sub-pages? y/n', prefs.includeSubpages ? 'y' : 'n')).toLowerCase() ===
      'y';
    const amount = Number(await ask('Parallel downloads (1–32)', String(prefs.concurrency)));
    const concurrency =
      Number.isInteger(amount) && amount >= 1 && amount <= 32 ? amount : prefs.concurrency;
    if ((await ask('Start export? y/n', 'y')).toLowerCase() !== 'y') {
      console.log(ui.muted('Export cancelled.'));
      return;
    }
    rl.close();
    await launchExport({
      schemaVersion: 1,
      provider,
      siteUrl: url,
      outDir,
      prettyPrint,
      includeSubpages,
      concurrency,
      step: 3,
    });
  } finally {
    rl.close();
  }
}
