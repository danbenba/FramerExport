import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { defaultPreferences, savePreferences } from '../../src/cli/preferences.js';
import {
  checkForUpdates,
  compareVersions,
  fetchUpdateTags,
  getUpdateCommand,
  installUpdate,
  selectUpdateVersion,
} from '../../src/cli/update-check.js';

function temporary(t: { after: (callback: () => void) => void }) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fexport-updates-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  return { home };
}

test('semantic version comparison covers release, numeric beta, lexical identifiers and metadata', () => {
  const increasing = [
    '5.0.0-alpha',
    '5.0.0-alpha.1',
    '5.0.0-alpha.beta',
    '5.0.0-beta',
    '5.0.0-beta.2',
    '5.0.0-beta.11',
    '5.0.0-rc.1',
    '5.0.0',
    '5.0.1',
    '5.1.0',
    '6.0.0',
  ];
  for (let i = 1; i < increasing.length; i++) {
    assert.equal(compareVersions(increasing[i - 1], increasing[i]), -1);
    assert.equal(compareVersions(increasing[i], increasing[i - 1]), 1);
  }
  assert.equal(compareVersions('5.0.0+abc', '5.0.0+def'), 0);
  assert.equal(
    compareVersions('5.0.0-beta.999999999999999999', '5.0.0-beta.1000000000000000000'),
    -1
  );
  for (const invalid of [
    'v5.0.0',
    '5.0',
    '5.0.0-beta.01',
    '05.0.0',
    '5.0.0;echo hi',
    '5.0.0-',
    '5.0.0+',
  ]) {
    assert.equal(compareVersions(invalid, '5.0.0'), null);
  }
});

test('beta opt-in still upgrades to the official stable release and never downgrades', () => {
  assert.equal(
    selectUpdateVersion({ latest: '5.0.0', beta: '5.0.0-beta.4' }, '5.0.0-beta.4', true),
    '5.0.0'
  );
  assert.equal(
    selectUpdateVersion({ latest: '4.4.3', beta: '5.0.0-beta.5' }, '5.0.0-beta.4', false),
    null
  );
  assert.equal(
    selectUpdateVersion({ latest: '4.4.3', beta: '5.0.0-beta.5' }, '5.0.0-beta.4', true),
    '5.0.0-beta.5'
  );
  assert.equal(
    selectUpdateVersion({ latest: '5.0.0', beta: '5.1.0-beta.1' }, '5.0.0', false),
    null
  );
  assert.equal(
    selectUpdateVersion({ latest: '5.0.0', beta: '5.1.0-beta.1' }, '5.0.0', true),
    '5.1.0-beta.1'
  );
  assert.equal(selectUpdateVersion({ latest: '5.0.0-beta.9' }, '4.4.3', false), null);
});

test('disabled update checks never access network or write a cache, including forced checks', async (t) => {
  const options = temporary(t);
  savePreferences({ checkUpdates: false }, options);
  let calls = 0;
  assert.equal(
    await checkForUpdates('5.0.0-beta.4', {
      ...options,
      force: true,
      fetchTags: async () => {
        calls++;
        return { latest: '5.0.0' };
      },
    }),
    null
  );
  assert.equal(calls, 0);
  assert.deepEqual(fs.readdirSync(options.home), ['settings.json']);
});

test('daily cache reuses metadata but recomputes updates for the installed version', async (t) => {
  const options = temporary(t);
  let calls = 0;
  const fetchTags = async () => {
    calls++;
    return { latest: '5.0.0', beta: '5.1.0-beta.1', malicious: 'ignored' };
  };
  assert.equal(await checkForUpdates('4.4.3', { ...options, now: 1000, fetchTags }), '5.0.0');
  assert.equal(await checkForUpdates('5.0.0', { ...options, now: 2000, fetchTags }), null);
  assert.equal(calls, 1);
  assert.equal(await checkForUpdates('4.4.3', { ...options, now: 86401000, fetchTags }), '5.0.0');
  assert.equal(calls, 2);
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(options.home, 'update-cache.json'), 'utf8')).tags
      .malicious,
    undefined
  );
});

test('changing update channel refreshes metadata and stale beta tags cannot suppress stable releases', async (t) => {
  const options = temporary(t);
  let calls = 0;
  const fetchTags = async () => {
    calls++;
    return { latest: '5.0.0', beta: '5.0.0-beta.4' };
  };
  await checkForUpdates('5.0.0-beta.4', { ...options, now: 1000, fetchTags });
  savePreferences({ betaUpdates: true }, options);
  assert.equal(
    await checkForUpdates('5.0.0-beta.4', { ...options, now: 2000, fetchTags }),
    '5.0.0'
  );
  assert.equal(calls, 2);
  await checkForUpdates('5.0.0-beta.4', { ...options, now: 3000, fetchTags });
  assert.equal(calls, 2);
});

test('registry errors are non-fatal, cached and malformed versions are discarded', async (t) => {
  const options = temporary(t);
  assert.equal(
    await checkForUpdates('4.4.3', {
      ...options,
      fetchTags: async () => {
        throw new Error('offline');
      },
    }),
    null
  );
  assert.equal(
    await checkForUpdates('4.4.3', {
      ...options,
      force: true,
      fetchTags: async () => ({ latest: '9.0.0; rm x', beta: [] }),
    }),
    null
  );
  const cached = JSON.parse(fs.readFileSync(path.join(options.home, 'update-cache.json'), 'utf8'));
  assert.deepEqual(cached.tags, {});
});

test('invalid or future-dated update caches do not block a fresh bounded check', async (t) => {
  const options = temporary(t);
  fs.writeFileSync(
    path.join(options.home, 'update-cache.json'),
    JSON.stringify({
      schemaVersion: 1,
      channel: 'stable',
      checkedAt: 9000,
      tags: { latest: '9.0.0' },
    })
  );
  let calls = 0;
  assert.equal(
    await checkForUpdates('4.4.3', {
      ...options,
      now: 1000,
      fetchTags: async () => {
        calls++;
        return { latest: '5.0.0' };
      },
    }),
    '5.0.0'
  );
  assert.equal(calls, 1);
});

test('HTTP registry reader rejects redirects, oversized responses and stalled sockets', async (t) => {
  let scenario = 'redirect';
  let destroyed = false;
  t.mock.method(
    https,
    'get',
    (_url: unknown, _options: unknown, callback: (res: unknown) => void) => {
      const request = Object.assign(new EventEmitter(), {
        destroy() {
          destroyed = true;
        },
      });
      queueMicrotask(() => {
        if (scenario === 'timeout') {
          request.emit('timeout');
          return;
        }
        const response = Object.assign(new EventEmitter(), {
          statusCode: scenario === 'redirect' ? 302 : 200,
          resume() {},
        });
        callback(response);
        response.emit(
          'data',
          scenario === 'large' ? Buffer.alloc(33 * 1024) : Buffer.from('{"latest":"5.0.0"}')
        );
        response.emit('end');
      });
      return request;
    }
  );
  assert.equal(await fetchUpdateTags(), null);
  scenario = 'large';
  assert.equal(await fetchUpdateTags(), null);
  assert.equal(destroyed, true);
  destroyed = false;
  scenario = 'timeout';
  assert.equal(await fetchUpdateTags(), null);
  assert.equal(destroyed, true);
  scenario = 'valid';
  assert.deepEqual(await fetchUpdateTags(), { latest: '5.0.0' });
});

function installFixture(t: { after: (callback: () => void) => void }, kind = 'devDependencies') {
  const { home } = temporary(t);
  const project = path.join(home, 'Project & examples');
  const packageRoot = path.join(project, 'node_modules', 'framer-export');
  const npmCliPath = path.join(home, 'npm cli', 'npm-cli.js');
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.mkdirSync(path.dirname(npmCliPath), { recursive: true });
  fs.writeFileSync(
    npmCliPath,
    "require('node:fs').writeFileSync(require('node:path').join(__dirname, 'arguments.json'), JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}));"
  );
  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({ name: 'fixture', [kind]: { 'framer-export': '^4.4.3' } })
  );
  return {
    home,
    project,
    packageRoot,
    npmCliPath,
    globalRoot: path.join(home, 'global', 'node_modules'),
  };
}

test('local update command preserves dev dependency scope and never uses a shell or global flags', (t) => {
  const fixture = installFixture(t);
  const prepared = getUpdateCommand('5.0.0-beta.4', fixture);
  assert.equal(prepared.status, 'ready');
  if (prepared.status !== 'ready') return;
  assert.equal(prepared.plan.scope, 'local');
  assert.equal(prepared.plan.command, process.execPath);
  assert.equal(prepared.plan.args[0], fs.realpathSync(fixture.npmCliPath));
  assert.equal(prepared.plan.args.includes('--save-dev'), true);
  assert.equal(prepared.plan.args.includes('--global'), false);
  assert.equal(prepared.plan.cwd, fixture.project);
  assert.ok(prepared.plan.args.includes('framer-export@5.0.0-beta.4'));
});

test('global update is offered only for a verified global installation', (t) => {
  const fixture = installFixture(t);
  const prepared = getUpdateCommand('5.0.0', {
    ...fixture,
    globalRoot: path.dirname(fixture.packageRoot),
  });
  assert.equal(prepared.status, 'ready');
  if (prepared.status !== 'ready') return;
  assert.equal(prepared.plan.scope, 'global');
  assert.equal(prepared.plan.args.includes('--global'), true);
});

test('source, temporary npx, unknown scope and other package managers never get silent global installation', (t) => {
  const fixture = installFixture(t);
  assert.equal(
    getUpdateCommand('5.0.0', { ...fixture, packageRoot: fixture.home }).status,
    'manual'
  );
  assert.equal(
    getUpdateCommand('5.0.0', {
      ...fixture,
      packageRoot: path.join(fixture.home, '_npx', 'abc', 'node_modules', 'framer-export'),
    }).status,
    'manual'
  );
  fs.writeFileSync(
    path.join(fixture.project, 'package.json'),
    JSON.stringify({
      name: 'fixture',
      packageManager: 'pnpm@10.0.0',
      dependencies: { 'framer-export': '*' },
    })
  );
  assert.equal(getUpdateCommand('5.0.0', fixture).status, 'manual');
  fs.writeFileSync(path.join(fixture.project, 'package.json'), JSON.stringify({ name: 'fixture' }));
  assert.equal(getUpdateCommand('5.0.0', fixture).status, 'manual');
  assert.equal(getUpdateCommand('5.0.0 & calc.exe', fixture).status, 'invalid');
});

test('automatic installer requires explicit opt-in before planning or executing anything', async (t) => {
  const fixture = installFixture(t);
  let executions = 0;
  const execute = async () => {
    executions++;
    return 0;
  };
  assert.equal(
    (await installUpdate('5.0.0', { ...fixture, automatic: true, execute })).status,
    'skipped'
  );
  assert.equal(executions, 0);
  assert.equal(
    (
      await installUpdate('5.0.0', {
        ...fixture,
        automatic: true,
        execute,
        preferences: { ...defaultPreferences, autoInstallUpdates: true },
      })
    ).status,
    'installed'
  );
  assert.equal(executions, 1);
  assert.equal(
    (
      await installUpdate('5.0.0', {
        ...fixture,
        automatic: true,
        execute,
        preferences: { ...defaultPreferences, autoInstallUpdates: true, checkUpdates: false },
      })
    ).status,
    'skipped'
  );
  assert.equal(executions, 1);
});

test('installer launches Node with literal arguments in paths containing shell characters', async (t) => {
  const fixture = installFixture(t);
  const result = await installUpdate('5.0.0-beta.4', fixture);
  assert.equal(result.status, 'installed');
  const recorded = JSON.parse(
    fs.readFileSync(path.join(path.dirname(fixture.npmCliPath), 'arguments.json'), 'utf8')
  );
  assert.equal(recorded.cwd, fixture.project);
  assert.ok(recorded.args.includes('framer-export@5.0.0-beta.4'));
  assert.ok(recorded.args.includes('--save-dev'));
  assert.equal(recorded.args.includes('--global'), false);
});

test('installer reports failures instead of claiming an update succeeded', async (t) => {
  const fixture = installFixture(t);
  assert.equal(
    (await installUpdate('5.0.0', { ...fixture, execute: async () => 1 })).status,
    'failed'
  );
  assert.equal(
    (
      await installUpdate('5.0.0', {
        ...fixture,
        execute: async () => {
          throw new Error('permission');
        },
      })
    ).status,
    'failed'
  );
});
