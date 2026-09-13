import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  clearDraft,
  defaultPreferences,
  getPreferencesDirectory,
  getPreferencesPath,
  readDraft,
  readPreferences,
  resetPreferences,
  saveDraft,
  savePreferences,
} from '../../src/cli/preferences.js';

function temporary(t: { after: (callback: () => void) => void }) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fexport-settings-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return { home };
}

test('first read uses complete defaults without creating files or completing onboarding', (t) => {
  const options = temporary(t);
  assert.deepEqual(readPreferences(options), defaultPreferences);
  assert.deepEqual(fs.readdirSync(options.home), []);
  assert.equal(readDraft(options), null);
  assert.equal(defaultPreferences.autoInstallUpdates, false);
});

test('settings persist and merge a whitelist of valid values across launches', (t) => {
  const options = temporary(t);
  savePreferences(
    { defaultProvider: 'webflow', onboardingCompleted: true, betaUpdates: true, concurrency: 6 },
    options
  );
  savePreferences({ viewMode: 'list', launchUi: true }, options);
  const result = readPreferences(options);
  assert.equal(result.defaultProvider, 'webflow');
  assert.equal(result.onboardingCompleted, true);
  assert.equal(result.betaUpdates, true);
  assert.equal(result.concurrency, 6);
  assert.equal(result.viewMode, 'list');
  assert.equal(result.launchUi, true);
  assert.equal(result.autoInstallUpdates, false);
  assert.equal(result.schemaVersion, 1);
  assert.deepEqual(fs.readdirSync(options.home), ['settings.json']);
});

test('invalid values and prototype properties cannot enable settings or replace valid defaults', (t) => {
  const options = temporary(t);
  savePreferences({ defaultProvider: 'framer', concurrency: 20 }, options);
  savePreferences(
    JSON.parse(
      '{"defaultProvider":"__proto__","concurrency":999,"autoInstallUpdates":"true","launchUi":1,"viewMode":"grid","schemaVersion":99,"arbitrary":"value","__proto__":{"polluted":true}}'
    ),
    options
  );
  const result = readPreferences(options);
  assert.equal(result.defaultProvider, 'framer');
  assert.equal(result.concurrency, 20);
  assert.equal(result.autoInstallUpdates, false);
  assert.equal(result.launchUi, false);
  assert.equal(result.viewMode, 'cards');
  assert.equal(result.schemaVersion, 1);
  assert.equal(Object.hasOwn(result, 'arbitrary'), false);
  assert.equal(Object.hasOwn(result, '__proto__'), false);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test('corrupt settings remain untouched on read and are backed up before explicit saving', (t) => {
  const options = temporary(t);
  const original = '{ "betaUpdates": true,';
  fs.writeFileSync(getPreferencesPath(options), original);
  const warnings: string[] = [];
  assert.deepEqual(
    readPreferences({ ...options, onWarning: (message) => warnings.push(message) }),
    defaultPreferences
  );
  assert.equal(warnings.length, 1);
  assert.equal(fs.readFileSync(getPreferencesPath(options), 'utf8'), original);
  assert.deepEqual(fs.readdirSync(options.home), ['settings.json']);
  savePreferences({ onboardingCompleted: true }, options);
  const backup = fs
    .readdirSync(options.home)
    .find((name) => name.startsWith('settings.json.backup-'))!;
  assert.ok(backup);
  assert.equal(fs.readFileSync(path.join(options.home, backup), 'utf8'), original);
  assert.equal(readPreferences(options).onboardingCompleted, true);
});

test('unknown future schema is preserved instead of silently downgrading on read', (t) => {
  const options = temporary(t);
  const original = JSON.stringify({ schemaVersion: 2, autoInstallUpdates: true });
  fs.writeFileSync(getPreferencesPath(options), original);
  assert.deepEqual(readPreferences(options), defaultPreferences);
  assert.equal(fs.readFileSync(getPreferencesPath(options), 'utf8'), original);
});

test('FEXPORT_HOME redirects all settings and explicit homes take precedence', (t) => {
  const options = temporary(t);
  const previous = process.env.FEXPORT_HOME;
  process.env.FEXPORT_HOME = path.join(options.home, 'environment');
  t.after(() => {
    if (previous === undefined) delete process.env.FEXPORT_HOME;
    else process.env.FEXPORT_HOME = previous;
  });
  assert.equal(getPreferencesDirectory(), process.env.FEXPORT_HOME);
  assert.equal(getPreferencesDirectory(options), options.home);
  savePreferences({ viewMode: 'list' });
  assert.equal(readPreferences().viewMode, 'list');
  assert.equal(readPreferences(options).viewMode, 'cards');
});

test('draft retains edited provider, URL, output, options and previous step across reloads', (t) => {
  const options = temporary(t);
  const draft = {
    provider: 'notion' as const,
    siteUrl: 'https://example.com/docs?lang=fr',
    outDir: './mon export',
    prettyPrint: false,
    includeSubpages: true,
    concurrency: 7,
    step: 3,
  };
  saveDraft(draft, options);
  assert.deepEqual(readDraft(options), { schemaVersion: 1, ...draft });
  saveDraft({ ...draft, step: 1 }, options);
  assert.deepEqual(readDraft(options), { schemaVersion: 1, ...draft, step: 1 });
  clearDraft(options);
  assert.equal(readDraft(options), null);
  clearDraft(options);
});

test('unfinished URL text resumes safely and step indices stay within the wizard', (t) => {
  const options = temporary(t);
  const draft = {
    provider: 'auto' as const,
    siteUrl: 'https://',
    outDir: '',
    prettyPrint: true,
    includeSubpages: false,
    concurrency: 12,
    step: 90,
  };
  saveDraft(draft, options);
  assert.equal(readDraft(options)?.siteUrl, 'https://');
  assert.equal(readDraft(options)?.step, 3);
  saveDraft({ ...draft, siteUrl: 'my site', step: -4 }, options);
  assert.equal(readDraft(options)?.siteUrl, 'my site');
  assert.equal(readDraft(options)?.step, 0);
});

test('draft rejects credentials, non-web URLs and terminal control sequences without replacing prior input', (t) => {
  const options = temporary(t);
  const draft = {
    provider: 'auto' as const,
    siteUrl: 'https://example.com',
    outDir: './export',
    prettyPrint: true,
    includeSubpages: false,
    concurrency: 12,
    step: 1,
  };
  saveDraft(draft, options);
  for (const siteUrl of [
    'https://user:pass@example.com',
    'https://user@',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'https://example.com/\u001b[2J',
  ]) {
    assert.throws(() => saveDraft({ ...draft, siteUrl }, options));
    assert.equal(readDraft(options)?.siteUrl, draft.siteUrl);
  }
  assert.throws(() => saveDraft({ ...draft, outDir: 'bad\npath' }, options));
});

test('persisted malformed field types normalize independently and oversized files remain intact', (t) => {
  const options = temporary(t);
  fs.writeFileSync(
    getPreferencesPath(options),
    JSON.stringify({
      schemaVersion: 1,
      defaultProvider: 'wix',
      concurrency: 1.5,
      betaUpdates: 'yes',
      checkUpdates: false,
    })
  );
  assert.equal(readPreferences(options).defaultProvider, 'wix');
  assert.equal(readPreferences(options).concurrency, 12);
  assert.equal(readPreferences(options).betaUpdates, false);
  assert.equal(readPreferences(options).checkUpdates, false);
  const original = ' '.repeat(70 * 1024);
  fs.writeFileSync(getPreferencesPath(options), original);
  assert.deepEqual(readPreferences(options), defaultPreferences);
  assert.equal(fs.readFileSync(getPreferencesPath(options), 'utf8'), original);
});

test('reset restores first-launch defaults and removes draft and cache while preserving exported and unrelated files', (t) => {
  const options = temporary(t);
  savePreferences(
    { defaultProvider: 'webflow', launchUi: true, betaUpdates: true, onboardingCompleted: true },
    options
  );
  saveDraft(
    {
      provider: 'webflow',
      siteUrl: 'https://example.com',
      outDir: path.join(options.home, 'exports'),
      prettyPrint: false,
      includeSubpages: true,
      concurrency: 6,
      step: 3,
    },
    options
  );
  fs.writeFileSync(path.join(options.home, 'update-cache.json'), '{"tags":{"beta":"9.0.0"}}');
  fs.writeFileSync(path.join(options.home, 'notes.txt'), 'keep notes');
  fs.writeFileSync(path.join(options.home, 'settings.json.backup-example'), 'keep backup');
  fs.mkdirSync(path.join(options.home, 'exports'));
  fs.writeFileSync(path.join(options.home, 'exports', 'index.html'), '<h1>Keep export</h1>');
  const result = resetPreferences(options);
  assert.deepEqual(result, defaultPreferences);
  assert.notEqual(result, defaultPreferences);
  assert.deepEqual(readPreferences(options), defaultPreferences);
  assert.equal(readDraft(options), null);
  assert.equal(fs.existsSync(path.join(options.home, 'update-cache.json')), false);
  assert.deepEqual(fs.readdirSync(options.home).sort(), [
    'exports',
    'notes.txt',
    'settings.json.backup-example',
  ]);
  assert.equal(fs.readFileSync(path.join(options.home, 'notes.txt'), 'utf8'), 'keep notes');
  assert.equal(
    fs.readFileSync(path.join(options.home, 'exports', 'index.html'), 'utf8'),
    '<h1>Keep export</h1>'
  );
  assert.deepEqual(resetPreferences(options), defaultPreferences);
});

test('reset never recursively removes a directory named like a settings file', (t) => {
  const options = temporary(t);
  savePreferences({ defaultProvider: 'framer' }, options);
  const directory = path.join(options.home, 'draft.json');
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'index.html'), 'keep export');
  assert.throws(() => resetPreferences(options), /not a settings file/);
  assert.equal(readPreferences(options).defaultProvider, 'framer');
  assert.equal(fs.readFileSync(path.join(directory, 'index.html'), 'utf8'), 'keep export');
});

test('reset of an unused configuration directory does not create files', (t) => {
  const options = temporary(t);
  const unused = { home: path.join(options.home, 'unused') };
  assert.deepEqual(resetPreferences(unused), defaultPreferences);
  assert.equal(fs.existsSync(unused.home), false);
});
