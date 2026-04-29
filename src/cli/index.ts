import path from 'path';
import { URL } from 'url';
import pkg from '../../package.json';
import { showHelp } from './help.js';
import { showBanner } from './banner.js';
import { checkForUpdates } from './update-check.js';
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
    console.log(`  ${chalk.white.bold('Framer Export')}  ${chalk.gray(`v${pkg.version}`)}`);
    console.log(`  ${chalk.white(pkg.description)}\n`);
    console.log(`  ${chalk.white.bold('Author')}     ${chalk.cyan('Dany (danbenba)')}`);
    console.log(`  ${chalk.white.bold('Portfolio')}  ${chalk.underline.cyan('https://github.com/danbenba')}`);
    console.log(`  ${chalk.white.bold('GitHub')}     ${chalk.underline.cyan(pkg.repository.url.replace('git+', '').replace('.git', ''))}`);
    console.log(`  ${chalk.white.bold('npm')}        ${chalk.underline.cyan(`https://www.npmjs.com/package/${pkg.name}`)}`);
    console.log(`  ${chalk.white.bold('License')}    ${chalk.green(pkg.license)}`);
    console.log(`  ${chalk.white.bold('Node')}       ${chalk.gray(`>=${pkg.engines.node}`)}`);
    console.log('');
    process.exit(0);
  }

  checkForUpdates(VERSION).then((latest) => {
    if (!latest) return;
    import('chalk').then((chalk) => {
      console.log('');
      console.log(
        `  ${chalk.default.yellow('↳')} Update available: ${chalk.default.gray(VERSION)} → ${chalk.default.green(latest)}`,
      );
      console.log(`  ${chalk.default.gray('  Run:')} ${chalk.default.cyan('npm i -g framer-export@latest')}`);
      console.log('');
    });
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

  showBanner();

  const url: string = args[0];

  try {
    new URL(url);
  } catch {
    const chalk = (await import('chalk')).default;
    console.log(`  ${chalk.red('✗')} ${chalk.red.bold('Invalid URL:')} ${chalk.white(url)}`);
    console.log(`  ${chalk.gray('Expected: https://yoursite.framer.app')}\n`);
    process.exit(1);
  }

  const { FramerExporter, deriveOutputName } = await import('../exporter/index.js');
  const { detectPlatform } = await import('../platforms/index.js');

  const detected = platformOverride || detectPlatform(url).name;
  const defaultDir: string = deriveOutputName(url, detected as PlatformType);
  const out: string = args[1] || `./${defaultDir}`;

  try {
    await new FramerExporter(url, path.resolve(out), platformOverride || undefined).run();
  } catch (e) {
    const chalk = (await import('chalk')).default;
    console.log(`\n  ${chalk.red('✗')} ${chalk.red.bold('FAILED:')} ${chalk.white((e as Error).message)}`);
    console.log(chalk.gray((e as Error).stack || ''));
    process.exit(1);
  }
}

main();
