#!/usr/bin/env node

import path from 'path';
import { URL } from 'url';
import { showHelp } from './help.js';
import { showBanner } from './banner.js';
import type { PlatformType } from '../platforms/types.js';

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
    showHelp();
    process.exit(0);
  }

  const platformOverride = extractFlag(args, '--platform') as PlatformType | null;

  showBanner();

  const url: string = args[0];
  const out: string = args[1] || './cooksite-output';

  try {
    new URL(url);
  } catch {
    const chalk = (await import('chalk')).default;
    console.log(`  ${chalk.red('✗')} ${chalk.red.bold('Invalid URL:')} ${chalk.white(url)}`);
    console.log(`  ${chalk.gray('Expected: https://yoursite.framer.app')}\n`);
    process.exit(1);
  }

  const { FramerExporter } = await import('../exporter/index.js');

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
