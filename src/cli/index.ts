import path from 'path';
import { URL } from 'url';
import pkg from '../../package.json';
import { showHelp } from './help.js';
import { showBanner } from './banner.js';
import { checkForUpdates } from './update-check.js';
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

  checkForUpdates(VERSION).then((latest) => {
    if (!latest) return;
    console.log('');
    console.log(
      `  ${ui.warning('↳')} Update available: ${ui.muted(VERSION)} -> ${ui.success(latest)}`
    );
    console.log(`  ${ui.primary('  Run:')} ${ui.primarySoft('npm i -g framer-export@latest')}`);
    console.log('');
  });

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  if (args.includes('--setup')) {
    hasFlag(args, '--setup');
    const legacyMode: boolean = hasFlag(args, '--legacy-mode');
    const { runSetup } = await import('./setup.js');
    await runSetup(legacyMode);
    return;
  }

  if (!args.length) {
    const { runSetup } = await import('./setup.js');
    await runSetup(false);
    return;
  }

  const platformOverride = extractFlag(args, '--platform') as PlatformType | null;
  const includeSubpages: boolean = hasFlag(args, '--subpages');

  showBanner();

  const url: string = args[0];

  try {
    new URL(url);
  } catch {
    console.log(`  ${ui.error('✗')} ${ui.error.bold('Invalid URL:')} ${ui.text(url)}`);
    console.log(`  ${ui.muted('Expected: https://yoursite.framer.app')}\n`);
    process.exit(1);
  }

  const { FramerExporter, deriveOutputName } = await import('../exporter/index.js');
  const { detectPlatform } = await import('../platforms/index.js');

  const detected = platformOverride || detectPlatform(url).name;
  const defaultDir: string = deriveOutputName(url, detected as PlatformType);
  const out: string = args[1] || `./${defaultDir}`;

  try {
    await new FramerExporter(url, path.resolve(out), platformOverride || undefined).run(
      includeSubpages
    );
  } catch (e) {
    const chalk = (await import('chalk')).default;
    console.log(
      `\n  ${ui.error('✗')} ${ui.error.bold('FAILED:')} ${ui.text((e as Error).message)}`
    );
    console.log(chalk.gray((e as Error).stack || ''));
    process.exit(1);
  }
}

main();
