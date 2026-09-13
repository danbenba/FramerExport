import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import {
  getPreferencesDirectory,
  readPreferences,
  writeStateJson,
  type PreferenceOptions,
  type Preferences,
} from './preferences.js';

const DAY = 24 * 60 * 60 * 1000;
const REGISTRY_TAGS = 'https://registry.npmjs.org/-/package/framer-export/dist-tags';

interface Version {
  core: bigint[];
  prerelease: string[];
}

function parseVersion(version: string): Version | null {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(
      version
    );
  if (!match) return null;
  const prerelease = match[4]?.split('.') ?? [];
  if (prerelease.some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith('0')))
    return null;
  return { core: match.slice(1, 4).map((value) => BigInt(value)), prerelease };
}

export function compareVersions(left: string, right: string): -1 | 0 | 1 | null {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return null;
  for (let i = 0; i < 3; i++) if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i] ? 1 : -1;
  if (!a.prerelease.length || !b.prerelease.length) {
    return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length ? -1 : 1;
  }
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
    const av = a.prerelease[i];
    const bv = b.prerelease[i];
    if (av === bv) continue;
    if (av === undefined) return -1;
    if (bv === undefined) return 1;
    const an = /^\d+$/.test(av);
    const bn = /^\d+$/.test(bv);
    if (an && bn) return BigInt(av) > BigInt(bv) ? 1 : -1;
    if (an !== bn) return an ? -1 : 1;
    return av > bv ? 1 : -1;
  }
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function selectUpdateVersion(
  tags: unknown,
  currentVersion: string,
  beta: boolean
): string | null {
  if (!isRecord(tags) || !parseVersion(currentVersion)) return null;
  const candidates = [tags.latest, ...(beta ? [tags.beta] : [])]
    .filter(
      (value): value is string =>
        typeof value === 'string' && value.length <= 128 && !!parseVersion(value)
    )
    .filter((value) => beta || !parseVersion(value)!.prerelease.length)
    .filter((value) => compareVersions(value, currentVersion) === 1)
    .sort((a, b) => -(compareVersions(a, b) ?? 0));
  return candidates[0] ?? null;
}

export function fetchUpdateTags(): Promise<unknown> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve(value);
    };
    const req = https.get(
      REGISTRY_TAGS,
      {
        headers: { Accept: 'application/json', 'Accept-Encoding': 'identity' },
        timeout: 3500,
      },
      (res) => {
        if (res.statusCode !== 200) {
          req.destroy();
          finish(null);
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 32 * 1024) {
            req.destroy();
            finish(null);
            return;
          }
          chunks.push(chunk);
        });
        res.on('error', () => finish(null));
        res.on('end', () => {
          try {
            finish(JSON.parse(Buffer.concat(chunks).toString('utf8')));
          } catch {
            finish(null);
          }
        });
      }
    );
    const deadline = setTimeout(() => {
      req.destroy();
      finish(null);
    }, 4000);
    req.on('error', () => finish(null));
    req.on('timeout', () => {
      req.destroy();
      finish(null);
    });
  });
}

export interface CheckUpdateOptions extends PreferenceOptions {
  preferences?: Preferences;
  force?: boolean;
  now?: number;
  fetchTags?: () => Promise<unknown>;
}

export async function checkForUpdates(
  currentVersion: string,
  options: CheckUpdateOptions = {}
): Promise<string | null> {
  const preferences = options.preferences ?? readPreferences(options);
  if (!preferences.checkUpdates || !parseVersion(currentVersion)) return null;
  const channel = preferences.betaUpdates ? 'beta' : 'stable';
  const cacheFile = path.join(getPreferencesDirectory(options), 'update-cache.json');
  const now = options.now ?? Date.now();
  if (!options.force) {
    try {
      if (fs.statSync(cacheFile).size <= 64 * 1024) {
        const cache: unknown = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        if (
          isRecord(cache) &&
          cache.schemaVersion === 1 &&
          cache.channel === channel &&
          typeof cache.checkedAt === 'number' &&
          now >= cache.checkedAt &&
          now - cache.checkedAt < DAY
        ) {
          return selectUpdateVersion(cache.tags, currentVersion, preferences.betaUpdates);
        }
      }
    } catch {}
  }
  let tags: unknown;
  try {
    tags = await (options.fetchTags ?? fetchUpdateTags)();
  } catch {
    tags = null;
  }
  const cleanTags: Record<string, string> = {};
  if (isRecord(tags))
    for (const key of ['latest', 'beta']) {
      const value = tags[key];
      if (typeof value === 'string' && value.length <= 128 && parseVersion(value))
        cleanTags[key] = value;
    }
  try {
    writeStateJson(cacheFile, { schemaVersion: 1, channel, checkedAt: now, tags: cleanTags });
  } catch {}
  return selectUpdateVersion(cleanTags, currentVersion, preferences.betaUpdates);
}

export type InstallScope = 'global' | 'local' | 'source' | 'temporary' | 'unknown';
export interface UpdateCommand {
  command: string;
  args: string[];
  cwd: string;
  scope: 'global' | 'local';
  display: string;
}
export type UpdatePlan =
  | { status: 'ready'; plan: UpdateCommand }
  | { status: 'manual' | 'invalid'; scope: InstallScope; message: string };

export interface UpdateInstallOptions extends PreferenceOptions {
  preferences?: Preferences;
  automatic?: boolean;
  packageRoot?: string;
  npmCliPath?: string;
  globalRoot?: string;
  execute?: (plan: UpdateCommand) => Promise<number | null>;
}

function samePath(a: string, b: string): boolean {
  const normalize = (value: string) => {
    const absolute = path.resolve(value);
    return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
  };
  return normalize(a) === normalize(b);
}

function readPackage(file: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function findPackageRoot(): string | null {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (true) {
    if (readPackage(path.join(current, 'package.json'))?.name === 'framer-export') return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function findNpmCli(explicit?: string): string | null {
  const candidates = [
    explicit,
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(
      path.dirname(process.execPath),
      '..',
      'lib',
      'node_modules',
      'npm',
      'bin',
      'npm-cli.js'
    ),
    ...(process.env.PATH ?? '')
      .split(path.delimiter)
      .filter(Boolean)
      .flatMap((directory) => [
        path.join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
        path.join(directory, 'npm'),
      ]),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const resolved = fs.realpathSync(candidate);
      if (path.basename(resolved) === 'npm-cli.js' && fs.statSync(resolved).isFile())
        return resolved;
    } catch {}
  }
  return null;
}

export function getUpdateCommand(version: string, options: UpdateInstallOptions = {}): UpdatePlan {
  if (version.length > 128 || !parseVersion(version)) {
    return {
      status: 'invalid',
      scope: 'unknown',
      message: 'The update version is not a valid semantic version.',
    };
  }
  const packageRoot = options.packageRoot ?? findPackageRoot();
  if (!packageRoot)
    return {
      status: 'manual',
      scope: 'unknown',
      message: 'Could not identify this installation. Update it with your package manager.',
    };
  if (packageRoot.split(/[\\/]/).includes('_npx')) {
    return {
      status: 'manual',
      scope: 'temporary',
      message: `Start the new version with npx framer-export@${version}.`,
    };
  }
  if (path.basename(path.dirname(packageRoot)) !== 'node_modules') {
    return {
      status: 'manual',
      scope: 'source',
      message: 'This is a source checkout. Update and rebuild it from the repository.',
    };
  }
  const npmCli = findNpmCli(options.npmCliPath);
  if (!npmCli)
    return {
      status: 'manual',
      scope: 'unknown',
      message: 'Could not find npm-cli.js. Update this installation with your package manager.',
    };
  let globalRoot = options.globalRoot;
  if (!globalRoot) {
    try {
      globalRoot = execFileSync(process.execPath, [npmCli, 'root', '--global'], {
        encoding: 'utf8',
        timeout: 5000,
        windowsHide: true,
        shell: false,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {}
  }
  const dependency = `framer-export@${version}`;
  const flags = ['--no-audit', '--no-fund'];
  if (globalRoot && samePath(packageRoot, path.join(globalRoot, 'framer-export'))) {
    return {
      status: 'ready',
      plan: {
        command: process.execPath,
        args: [npmCli, 'install', '--global', dependency, ...flags],
        cwd: path.dirname(process.execPath),
        scope: 'global',
        display: `npm install --global ${dependency}`,
      },
    };
  }
  const projectRoot = path.dirname(path.dirname(packageRoot));
  const project = readPackage(path.join(projectRoot, 'package.json'));
  if (
    project &&
    typeof project.packageManager === 'string' &&
    !project.packageManager.startsWith('npm@')
  ) {
    return {
      status: 'manual',
      scope: 'local',
      message: `This project uses ${project.packageManager.split('@')[0]}. Update framer-export with that package manager.`,
    };
  }
  const dependencyKind = ['dependencies', 'devDependencies', 'optionalDependencies'].find(
    (key) => isRecord(project?.[key]) && Object.hasOwn(project[key], 'framer-export')
  );
  if (!project || !dependencyKind) {
    return {
      status: 'manual',
      scope: 'unknown',
      message:
        'The installation scope is unclear. Update framer-export using the original installation command.',
    };
  }
  const saveFlag =
    dependencyKind === 'devDependencies'
      ? '--save-dev'
      : dependencyKind === 'optionalDependencies'
        ? '--save-optional'
        : '--save-prod';
  return {
    status: 'ready',
    plan: {
      command: process.execPath,
      args: [npmCli, 'install', '--save-exact', saveFlag, dependency, ...flags],
      cwd: projectRoot,
      scope: 'local',
      display: `npm install --save-exact ${saveFlag} ${dependency}`,
    },
  };
}

export type UpdateInstallResult =
  | { status: 'installed'; scope: 'global' | 'local'; version: string }
  | { status: 'skipped' | 'manual' | 'invalid' | 'failed'; message: string };

function executeUpdate(plan: UpdateCommand): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(plan.command, plan.args, {
      cwd: plan.cwd,
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      child.kill();
      resolve(null);
    }, 120_000);
    const finish = (code: number | null) => {
      clearTimeout(timer);
      resolve(code);
    };
    child.once('error', () => finish(null));
    child.once('exit', (code) => finish(code));
  });
}

export async function installUpdate(
  version: string,
  options: UpdateInstallOptions = {}
): Promise<UpdateInstallResult> {
  const preferences = options.preferences ?? readPreferences(options);
  if (options.automatic && (!preferences.checkUpdates || !preferences.autoInstallUpdates)) {
    return { status: 'skipped', message: 'Automatic installation is disabled in settings.' };
  }
  const prepared = getUpdateCommand(version, options);
  if (prepared.status !== 'ready') return { status: prepared.status, message: prepared.message };
  try {
    const code = await (options.execute ?? executeUpdate)(prepared.plan);
    return code === 0
      ? { status: 'installed', version, scope: prepared.plan.scope }
      : {
          status: 'failed',
          message: `The update did not finish. Run ${prepared.plan.display} from the original installation directory.`,
        };
  } catch {
    return {
      status: 'failed',
      message: `The update could not start. Run ${prepared.plan.display} manually.`,
    };
  }
}
