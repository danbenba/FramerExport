import path from 'path';
import { URL } from 'url';
import { spawnSync } from 'child_process';
import pkg from '../../package.json';
import { showHelp } from './help.js';
import { showBanner } from './banner.js';
import { checkForUpdates, installUpdate, getUpdateCommand } from './update-check.js';
import { readPreferences, getPreferencesPath, type Preferences } from './preferences.js';
import { select } from './select.js';
import { ui } from './theme.js';
import type { PlatformType } from '../platforms/types.js';

const VERSION = pkg.version;

function extractFlag(args: string[], flag: string): string | null {
  const idx: number = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  const value: string = args[idx + 1];
  args.splice(idx, 2);
  return value;
}

function hasFlag(args: string[], flag: string): boolean {
  const idx: number = args.indexOf(flag);
  if (idx === -1) return false;
  args.splice(idx, 1);
  return true;
}

async function showUpdateNotice(preferences: Preferences): Promise<void> {
  const latest = await checkForUpdates(VERSION, { preferences });
  if (!latest) return;

  const command = getUpdateCommand(latest);
  if (preferences.autoInstallUpdates) {
    const installed = await installUpdate(latest, { preferences, automatic: true });
    if (installed.status === 'installed') {
      console.log(`Updated to ${latest}. Re-run your command to use it.`);
      process.exit(0);
    }
    console.log(installed.message);
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.log('');
    console.log(
      `  ${ui.warning('↳')} Update available: ${ui.muted(VERSION)} -> ${ui.success(latest)}`
    );
    console.log(command.status === 'ready' ? command.plan.display : command.message);
    console.log('');
    return;
  }

  const action = await select(
    'Update available',
    [
      { label: 'Continue without updating', value: 'continue' },
      {
        label: command.status === 'ready' ? 'Update this installation' : 'Show update instructions',
        value: 'update',
      },
    ],
    0,
    {
      headerLines: [
        `Current version: ${VERSION}`,
        `Latest version:  ${latest}`,
        'You can continue now and update later.',
      ],
      footer: 'enter continue  ·  mouse hover/click',
    }
  );

  if (action === 'update') {
    const result = await installUpdate(latest, { preferences });
    if (result.status === 'installed') {
      console.log(`\n  ${ui.success('✓')} Updated. Re-run your command to use the new version.\n`);
      process.exit(0);
    }

    console.log('\n  ' + result.message + '\n');
  }
}

async function main(): Promise<void> {
  const args: string[] = process.argv.slice(2);

  if (args.includes('--version') || args.includes('-v')) {
    console.log(VERSION);
    process.exit(0);
  }

  if (args.includes('--about')) {
    const chalk = (await import('chalk')).default;
    showBanner();
    console.log(`  ${ui.text.bold('Framer Export')}  ${ui.muted(`v${pkg.version}`)}`);
    console.log(`  ${ui.text(pkg.description)}\n`);
    console.log(`  ${ui.text.bold('Author')}     ${ui.primary('Dany (danbenba)')}`);
    console.log(
      `  ${ui.text.bold('Portfolio')}  ${chalk.underline.hex('#FAB283')('https://github.com/danbenba')}`
    );
    console.log(
      `  ${ui.text.bold('GitHub')}     ${chalk.underline.hex('#FAB283')(pkg.repository.url.replace('git+', '').replace('.git', ''))}`
    );
    console.log(
      `  ${ui.text.bold('npm')}        ${chalk.underline.hex('#FAB283')(`https://www.npmjs.com/package/${pkg.name}`)}`
    );
    console.log(`  ${ui.text.bold('License')}    ${ui.success(pkg.license)}`);
    console.log(`  ${ui.text.bold('Node')}       ${ui.muted(`>=${pkg.engines.node}`)}`);
    console.log('');
    process.exit(0);
  }

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  if (args[0] === 'config') {
    console.log(JSON.stringify({ path: getPreferencesPath(), ...readPreferences() }, null, 2));
    return;
  }
  if (args[0] === 'doctor' || hasFlag(args, '--doctor')) {
    const { existsSync } = await import('node:fs');
    const puppeteer = (await import('puppeteer')).default;
    const browserPath = puppeteer.executablePath();
    const preferences = readPreferences();
    console.log(
      JSON.stringify(
        {
          version: VERSION,
          node: process.version,
          platform: process.platform,
          terminal: {
            interactive: !!process.stdin.isTTY && !!process.stdout.isTTY,
            columns: process.stdout.columns || null,
            rows: process.stdout.rows || null,
            colorDepth: process.stdout.getColorDepth?.() || 1,
          },
          browser: { installed: existsSync(browserPath), executable: browserPath },
          preferences: getPreferencesPath(),
          updates: {
            enabled: preferences.checkUpdates,
            channel: preferences.betaUpdates ? 'beta' : 'stable',
            automaticInstall: preferences.autoInstallUpdates,
          },
        },
        null,
        2
      )
    );
    process.exitCode = existsSync(browserPath) ? 0 : 1;
    return;
  }
  if (args[0] === 'settings' || hasFlag(args, '--settings')) {
    const { runSetup } = await import('./setup.js');
    await runSetup(false, true);
    return;
  }

  if (args[0] === 'ui') {
    args.shift();
    const portValue = extractFlag(args, '--port');
    const port = portValue === null ? 4400 : Number(portValue);
    if (!Number.isFinite(port) || port < 0 || port > 65535) {
      console.log(
        `  ${ui.error('✗')} ${ui.error.bold('Invalid port:')} ${ui.text(portValue || '')}\n`
      );
      process.exit(1);
    }
    showBanner();
    const { startUiServer } = await import('../ui/server.js');
    const handle = await startUiServer(port);
    if (process.env.FEXPORT_COMPANION === '1') {
      process.stdin.resume();
      process.stdin.once('end', () => {
        void handle.close().finally(() => process.exit(0));
      });
    }
    if (!hasFlag(args, '--no-open')) {
      const target = `http://localhost:${handle.port}`;
      const opener =
        process.platform === 'win32'
          ? { cmd: 'cmd', args: ['/c', 'start', '', target] }
          : process.platform === 'darwin'
            ? { cmd: 'open', args: [target] }
            : { cmd: 'xdg-open', args: [target] };
      spawnSync(opener.cmd, opener.args, { stdio: 'ignore', windowsHide: true });
    }
    return;
  }

  const preferences = readPreferences();
  if (!hasFlag(args, '--no-update')) await showUpdateNotice(preferences);
  const fresh = hasFlag(args, '--fresh');

  if (args.includes('--setup')) {
    hasFlag(args, '--setup');
    const legacyMode: boolean = hasFlag(args, '--legacy-mode');
    const { runSetup } = await import('./setup.js');
    await runSetup(legacyMode, false, fresh);
    return;
  }

  if (!args.length) {
    const { runSetup } = await import('./setup.js');
    await runSetup(false, false, fresh);
    return;
  }

  const platformOverride = extractFlag(args, '--platform') as PlatformType | null;
  const hasDprFlag = args.includes('--dpr');
  const dprValue = extractFlag(args, '--dpr');
  const includeSubpages = hasFlag(args, '--subpages') || preferences.includeSubpages;

  const deviceScaleFactor = dprValue === null ? 1 : Number(dprValue);
  if (
    (hasDprFlag && dprValue === null) ||
    !Number.isFinite(deviceScaleFactor) ||
    deviceScaleFactor <= 0
  ) {
    console.log(`  ${ui.error('✗')} ${ui.error.bold('Invalid DPR:')} ${ui.text(dprValue || '')}`);
    console.log(`  ${ui.muted('Expected a positive number, for example: --dpr 2')}\n`);
    process.exit(1);
  }

  showBanner();

  const url: string = args[0];

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
      throw new Error('Invalid public website URL');
  } catch {
    console.log(`  ${ui.error('✗')} ${ui.error.bold('Invalid URL:')} ${ui.text(url)}`);
    console.log(`  ${ui.muted('Expected: https://yoursite.framer.app')}\n`);
    process.exit(1);
  }

  const { FramerExporter, deriveOutputName } = await import('../exporter/index.js');
  const { detectPlatform, PLATFORM_REGISTRY } = await import('../platforms/index.js');
  if (platformOverride && !PLATFORM_REGISTRY.some((item) => item.name === platformOverride)) {
    throw new Error('Unknown provider: ' + platformOverride);
  }
  const defaultProvider =
    preferences.defaultProvider !== 'auto' && preferences.defaultProvider !== 'unknown'
      ? preferences.defaultProvider
      : undefined;

  const detected = platformOverride || defaultProvider || detectPlatform(url).name;
  const defaultDir: string = deriveOutputName(url, detected as PlatformType);
  const out: string = args[1] || `./${defaultDir}`;

  try {
    const { CFG } = await import('../config/index.js');
    CFG.concurrency = preferences.concurrency;
    const exporter = new FramerExporter(
      url,
      path.resolve(out),
      platformOverride || defaultProvider,
      deviceScaleFactor
    );
    exporter.prettyPrint = preferences.prettyPrint;
    await exporter.run(includeSubpages);
  } catch (e) {
    const { AntiBotError, formatAntiBotError } = await import('../exporter/anti-bot.js');
    if (e instanceof AntiBotError) {
      console.log(formatAntiBotError(e));
      process.exit(1);
    }
    const chalk = (await import('chalk')).default;
    console.log(
      `\n  ${ui.error('✗')} ${ui.error.bold('FAILED:')} ${ui.text((e as Error).message)}`
    );
    console.log(chalk.gray((e as Error).stack || ''));
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
