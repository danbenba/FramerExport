import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectDirectory = fileURLToPath(new URL('../', import.meta.url));

export function release(
  args = process.argv.slice(2),
  { env = process.env, run = spawnSync, report = console.error } = {}
) {
  const npmCli = env.npm_execpath;
  if (!npmCli) {
    report('Run this command through npm: npm run release -- [publish options]');
    return 1;
  }

  const bypassOptions = new Set(['--bypass-tests', '--bypass-checks']);
  const bypass = args.some((arg) => bypassOptions.has(arg));
  const publishArgs = args.filter((arg) => !bypassOptions.has(arg));
  const commands = [
    ...(!bypass
      ? [
          ['run', 'check'],
          ['run', 'build'],
        ]
      : []),
    ['publish', ...publishArgs, '--ignore-scripts'],
  ];

  for (const command of commands) {
    const phase =
      command[0] === 'publish' ? 'Publish' : command[1] === 'build' ? 'Build' : 'Checks';
    let result;
    try {
      result = run(process.execPath, [npmCli, ...command], {
        cwd: projectDirectory,
        env,
        stdio: 'inherit',
        shell: false,
      });
    } catch {
      report(`${phase} could not start. Release stopped.`);
      return 1;
    }
    if (result.error) {
      report(`${phase} could not start. Release stopped.`);
      return 1;
    }
    if (result.signal) {
      report(`${phase} interrupted. Release stopped.`);
      return result.signal === 'SIGINT' ? 130 : result.signal === 'SIGTERM' ? 143 : 1;
    }
    if (result.status !== 0) {
      report(`${phase} failed. Release stopped.`);
      return Number.isInteger(result.status) && result.status > 0 ? result.status : 1;
    }
  }
  return 0;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = release();
}
