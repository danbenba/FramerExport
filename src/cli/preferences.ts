import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PlatformType } from '../platforms/types.js';

export interface Preferences {
  schemaVersion: 1;
  defaultProvider: 'auto' | PlatformType;
  launchUi: boolean;
  checkUpdates: boolean;
  autoInstallUpdates: boolean;
  betaUpdates: boolean;
  viewMode: 'cards' | 'list';
  reduceMotion: boolean;
  onboardingCompleted: boolean;
  prettyPrint: boolean;
  includeSubpages: boolean;
  concurrency: number;
}

export const defaultPreferences: Readonly<Preferences> = Object.freeze({
  schemaVersion: 1,
  defaultProvider: 'auto',
  launchUi: false,
  checkUpdates: true,
  autoInstallUpdates: false,
  betaUpdates: false,
  viewMode: 'cards',
  reduceMotion: false,
  onboardingCompleted: false,
  prettyPrint: true,
  includeSubpages: false,
  concurrency: 12,
});

export interface PreferenceOptions {
  home?: string;
  onWarning?: (message: string) => void;
}

export interface ExportDraft {
  schemaVersion: 1;
  provider: Preferences['defaultProvider'];
  siteUrl: string;
  outDir: string;
  prettyPrint: boolean;
  includeSubpages: boolean;
  concurrency: number;
  step: number;
}

const providers: Record<PlatformType | 'auto', true> = {
  auto: true,
  framer: true,
  webflow: true,
  wix: true,
  bubble: true,
  carrd: true,
  duda: true,
  squarespace: true,
  strikingly: true,
  tilda: true,
  weebly: true,
  clickfunnels: true,
  elementor: true,
  instapage: true,
  systemeio: true,
  unbounce: true,
  ghost: true,
  notion: true,
  wordpress: true,
  kajabi: true,
  podia: true,
  teachable: true,
  thinkific: true,
  gumroad: true,
  shopify: true,
  gamma: true,
  unknown: true,
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isProvider(value: unknown): value is Preferences['defaultProvider'] {
  return typeof value === 'string' && Object.hasOwn(providers, value);
}

function isConcurrency(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 32;
}

export function getPreferencesDirectory(options: PreferenceOptions = {}): string {
  return path.resolve(
    options.home || process.env.FEXPORT_HOME || path.join(os.homedir(), '.fexport')
  );
}

export function getPreferencesPath(options: PreferenceOptions = {}): string {
  return path.join(getPreferencesDirectory(options), 'settings.json');
}

interface JsonFile {
  value: Record<string, unknown> | null;
  corrupt: boolean;
}

function readJsonFile(file: string, options: PreferenceOptions): JsonFile {
  try {
    if (fs.statSync(file).size > 64 * 1024) throw new Error('file exceeds 64 KiB');
    const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!record(value) || (value.schemaVersion !== undefined && value.schemaVersion !== 1)) {
      throw new Error('unsupported settings format');
    }
    return { value, corrupt: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { value: null, corrupt: false };
    options.onWarning?.(
      `Could not read ${file}; using defaults. The original is kept until you save.`
    );
    return { value: null, corrupt: true };
  }
}

function applyPreferences(base: Preferences, values: unknown): Preferences {
  const result = { ...base, schemaVersion: 1 as const };
  if (!record(values)) return result;
  if (isProvider(values.defaultProvider)) result.defaultProvider = values.defaultProvider;
  if (values.viewMode === 'cards' || values.viewMode === 'list') result.viewMode = values.viewMode;
  if (isConcurrency(values.concurrency)) result.concurrency = values.concurrency;
  const booleans = [
    'launchUi',
    'checkUpdates',
    'autoInstallUpdates',
    'betaUpdates',
    'reduceMotion',
    'onboardingCompleted',
    'prettyPrint',
    'includeSubpages',
  ] as const;
  for (const key of booleans) if (typeof values[key] === 'boolean') result[key] = values[key];
  return result;
}

export function readPreferences(options: PreferenceOptions = {}): Preferences {
  return applyPreferences(
    { ...defaultPreferences },
    readJsonFile(getPreferencesPath(options), options).value
  );
}

export function writeStateJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  let handle: number | undefined;
  try {
    handle = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(handle, JSON.stringify(value, null, 2) + '\n', 'utf8');
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = undefined;
    fs.renameSync(temporary, file);
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function preserveCorruptFile(file: string, state: JsonFile): void {
  if (!state.corrupt || !fs.existsSync(file)) return;
  fs.copyFileSync(file, `${file}.backup-${Date.now()}-${randomUUID()}`, fs.constants.COPYFILE_EXCL);
}

export function savePreferences(
  patch: Partial<Preferences>,
  options: PreferenceOptions = {}
): Preferences {
  const file = getPreferencesPath(options);
  const state = readJsonFile(file, options);
  const next = applyPreferences(applyPreferences({ ...defaultPreferences }, state.value), patch);
  preserveCorruptFile(file, state);
  writeStateJson(file, next);
  return next;
}

function cleanDraft(values: unknown, preferences: Preferences): ExportDraft | null {
  if (!record(values)) return null;
  const safeString = (value: unknown, max: number) =>
    typeof value === 'string' && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
  if (!safeString(values.siteUrl, 8192) || !safeString(values.outDir, 4096)) return null;
  const siteUrl = values.siteUrl as string;
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(siteUrl);
  if (scheme && !/^https?$/i.test(scheme[1])) return null;
  if (/^https?:\/\/[^/?#]*@/i.test(siteUrl)) return null;
  try {
    if (siteUrl) {
      const url = new URL(siteUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    }
  } catch {}
  return {
    schemaVersion: 1,
    provider: isProvider(values.provider) ? values.provider : preferences.defaultProvider,
    siteUrl: values.siteUrl as string,
    outDir: values.outDir as string,
    prettyPrint:
      typeof values.prettyPrint === 'boolean' ? values.prettyPrint : preferences.prettyPrint,
    includeSubpages:
      typeof values.includeSubpages === 'boolean'
        ? values.includeSubpages
        : preferences.includeSubpages,
    concurrency: isConcurrency(values.concurrency) ? values.concurrency : preferences.concurrency,
    step:
      typeof values.step === 'number' && Number.isInteger(values.step)
        ? Math.max(0, Math.min(3, values.step))
        : 0,
  };
}

export function readDraft(options: PreferenceOptions = {}): ExportDraft | null {
  return cleanDraft(
    readJsonFile(path.join(getPreferencesDirectory(options), 'draft.json'), options).value,
    readPreferences(options)
  );
}

export function saveDraft(
  draft: Omit<ExportDraft, 'schemaVersion'> | ExportDraft,
  options: PreferenceOptions = {}
): void {
  const next = cleanDraft(draft, readPreferences(options));
  if (!next) throw new Error('The export draft contains an invalid URL or output directory.');
  const file = path.join(getPreferencesDirectory(options), 'draft.json');
  preserveCorruptFile(file, readJsonFile(file, options));
  writeStateJson(file, next);
}

export function clearDraft(options: PreferenceOptions = {}): void {
  const file = path.join(getPreferencesDirectory(options), 'draft.json');
  try {
    fs.unlinkSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export function resetPreferences(options: PreferenceOptions = {}): Preferences {
  const directory = getPreferencesDirectory(options);
  const files = ['settings.json', 'draft.json', 'update-cache.json'].map((name) =>
    path.join(directory, name)
  );
  for (const file of files) {
    try {
      const state = fs.lstatSync(file);
      if (!state.isFile() && !state.isSymbolicLink())
        throw new Error(`Cannot reset ${file}: the path is not a settings file.`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  for (const file of files) {
    try {
      fs.unlinkSync(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return { ...defaultPreferences };
}
