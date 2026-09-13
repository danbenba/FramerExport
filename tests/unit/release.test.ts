import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncOptions } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { release } from '../../scripts/release.mjs';

const projectDirectory = fileURLToPath(new URL('../../', import.meta.url));
const npmCli = resolve(projectDirectory, 'tmp', 'npm with spaces', 'npm-cli.js');

function runner(results: Record<string, unknown>[] = []) {
  const calls: { executable: string; args: string[]; options: SpawnSyncOptions }[] = [];
  const messages: string[] = [];
  return {
    calls,
    messages,
    options: {
      env: { npm_execpath: npmCli },
      report: (message: string) => messages.push(message),
      run: (executable: string, args: string[], options: SpawnSyncOptions) => {
        calls.push({ executable, args, options });
        return results.shift() ?? { status: 0, signal: null };
      },
    },
  };
}

test('release validates, builds, then publishes from the project directory without a shell', () => {
  const subject = runner();
  assert.equal(release([], subject.options), 0);
  assert.deepEqual(
    subject.calls.map((call) => call.args),
    [
      [npmCli, 'run', 'check'],
      [npmCli, 'run', 'build'],
      [npmCli, 'publish', '--ignore-scripts'],
    ]
  );
  for (const call of subject.calls) {
    assert.equal(call.executable, process.execPath);
    assert.equal(call.options.cwd, projectDirectory);
    assert.equal(call.options.shell, false);
    assert.equal(call.options.stdio, 'inherit');
  }
  assert.deepEqual(subject.messages, []);
});

test('both bypass flags publish directly without running checks or build', () => {
  const options = ['--dry-run', '--tag', 'latest', '--access=public', '--otp', '123456'];
  for (const flags of [
    ['--bypass-tests'],
    ['--bypass-checks'],
    ['--bypass-tests', '--bypass-checks'],
  ]) {
    const subject = runner();
    assert.equal(release([...flags, ...options], subject.options), 0);
    assert.deepEqual(
      subject.calls.map((call) => call.args),
      [[npmCli, 'publish', ...options, '--ignore-scripts']]
    );
    assert.deepEqual(subject.messages, []);
  }
});

test('publication always disables lifecycle scripts even when arguments try to re-enable them', () => {
  const subject = runner();
  assert.equal(release(['--bypass-tests', '--ignore-scripts=false'], subject.options), 0);
  assert.deepEqual(
    subject.calls.map((call) => call.args),
    [[npmCli, 'publish', '--ignore-scripts=false', '--ignore-scripts']]
  );
});

test('dry-run retains checks and build while forwarding npm dry-run to publication', () => {
  const subject = runner();
  assert.equal(release(['--dry-run'], subject.options), 0);
  assert.equal(subject.calls.length, 3);
  assert.deepEqual(subject.calls[2].args, [npmCli, 'publish', '--dry-run', '--ignore-scripts']);
});

test('failed checks stop before build and publication and preserve the exit code', () => {
  const subject = runner([{ status: 7 }]);
  assert.equal(release([], subject.options), 7);
  assert.equal(subject.calls.length, 1);
  assert.deepEqual(subject.messages, ['Checks failed. Release stopped.']);
});

test('a failed build never publishes', () => {
  const subject = runner([{ status: 0 }, { status: 12 }]);
  assert.equal(release([], subject.options), 12);
  assert.equal(subject.calls.length, 2);
  assert.ok(subject.calls.every((call) => call.args[1] !== 'publish'));
  assert.deepEqual(subject.messages, ['Build failed. Release stopped.']);
});

test('publication failures propagate their exit code without logging private arguments', () => {
  const subject = runner([{ status: 0 }, { status: 0 }, { status: 9 }]);
  assert.equal(release(['--otp', 'private-value'], subject.options), 9);
  assert.equal(subject.calls.length, 3);
  assert.deepEqual(subject.messages, ['Publish failed. Release stopped.']);
  assert.equal(subject.messages.join('').includes('private-value'), false);
});

test('process launch errors stop the release without printing error details or secrets', () => {
  const subject = runner([{ error: new Error('secret-token'), status: null }]);
  assert.equal(release([], subject.options), 1);
  assert.equal(subject.calls.length, 1);
  assert.deepEqual(subject.messages, ['Checks could not start. Release stopped.']);
  const thrown = runner();
  thrown.options.run = () => {
    throw new Error('secret-token');
  };
  assert.equal(release([], thrown.options), 1);
  assert.deepEqual(thrown.messages, ['Checks could not start. Release stopped.']);
});

test('interrupted commands stop before publication and return conventional signal exit codes', () => {
  for (const [signal, status] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
    ['SIGKILL', 1],
  ] as const) {
    const subject = runner([{ status: null, signal }]);
    assert.equal(release([], subject.options), status);
    assert.equal(subject.calls.length, 1);
    assert.deepEqual(subject.messages, ['Checks interrupted. Release stopped.']);
  }
});

test('direct invocation without npm context explains the supported command without starting a process', () => {
  const subject = runner();
  assert.equal(release([], { ...subject.options, env: {} }), 1);
  assert.deepEqual(subject.calls, []);
  assert.deepEqual(subject.messages, [
    'Run this command through npm: npm run release -- [publish options]',
  ]);
});

test('inherited ignore-scripts does not remove explicit checks or build commands', () => {
  const subject = runner();
  assert.equal(
    release([], {
      ...subject.options,
      env: { npm_execpath: npmCli, npm_config_ignore_scripts: 'true' },
    }),
    0
  );
  assert.deepEqual(
    subject.calls.map((call) => call.args[1]),
    ['run', 'run', 'publish']
  );
  assert.equal(subject.calls[2].options.env?.npm_config_ignore_scripts, 'true');
});

test('real child processes preserve spaced paths and publish arguments without shell interpretation', async (t) => {
  await mkdir(resolve(projectDirectory, 'tmp'), { recursive: true });
  const directory = await mkdtemp(resolve(projectDirectory, 'tmp', 'release test '));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fakeNpm = resolve(directory, 'npm cli.cjs');
  const output = resolve(directory, 'calls.jsonl');
  await writeFile(
    fakeNpm,
    "require('node:fs').appendFileSync(process.env.RELEASE_TEST_OUTPUT, JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()})+'\\n');"
  );
  const args = ['--bypass-tests', '--dry-run', '--tag', 'literal $() & value'];
  const result = spawnSync(
    process.execPath,
    [resolve(projectDirectory, 'scripts/release.mjs'), ...args],
    {
      cwd: directory,
      env: { ...process.env, npm_execpath: fakeNpm, RELEASE_TEST_OUTPUT: output },
      encoding: 'utf8',
      shell: false,
    }
  );
  assert.equal(result.status, 0, result.stderr);
  const calls = (await readFile(output, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(calls, [
    {
      args: ['publish', '--dry-run', '--tag', 'literal $() & value', '--ignore-scripts'],
      cwd: resolve(projectDirectory),
    },
  ]);
});
