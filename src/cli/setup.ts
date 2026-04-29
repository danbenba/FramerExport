import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import path from 'node:path';
import { URL } from 'node:url';
import chalk from 'chalk';
import { showBanner } from './banner.js';
import { FramerExporter, deriveOutputName } from '../exporter/index.js';
import { detectPlatform } from '../platforms/index.js';
import { select } from './select.js';
import type { PlatformType } from '../platforms/types.js';

function getWidth(): number {
  return process.stdout.columns || 80;
}

function drawHeader(title: string): void {
  const width = getWidth();
  const isSmall = width < 50;
  const magenta = chalk.magenta;
  const boldWhite = chalk.bold.white;

  if (isSmall) {
    console.log(`\n${magenta('●')} ${boldWhite(title)}`);
    return;
  }

  const boxWidth = 45;
  const padding = Math.max(0, boxWidth - title.length - 2);
  const rightPad = ' '.repeat(padding);
  
  console.log(magenta('  ┌─────────────────────────────────────────────┐'));
  console.log(magenta('  │') + boldWhite('  ' + title) + rightPad + magenta('│'));
  console.log(magenta('  └─────────────────────────────────────────────┘'));
  console.log('');
}

function line(label: string, value: string): void {
  const width = getWidth();
  const isSmall = width < 50;
  const magenta = chalk.magenta;
  
  if (isSmall) {
    console.log(`  ${chalk.bold(label)}: ${chalk.yellow(value)}`);
    return;
  }
  console.log(`  ${magenta('│')} ${chalk.bold(label.padEnd(14))} ${chalk.yellow(value)}`);
}

export async function runSetup(legacyMode: boolean = false): Promise<void> {
  showBanner();

  console.log(chalk.bold.white('  Welcome to Framer Export setup.\n'));
  console.log(chalk.gray('  Supports Framer, Webflow, and Wix sites.\n'));

  const rl = readline.createInterface({ input: stdin, output: stdout });

  const ask = async (question: string, defaultVal?: string): Promise<string> => {
    const suffix: string = defaultVal ? chalk.gray(` (${defaultVal})`) : '';
    const prompt: string = `  ${chalk.cyan('?')} ${chalk.white.bold(question)}${suffix} ${chalk.gray('>')} `;
    const answer: string = await rl.question(prompt);
    return answer.trim() || defaultVal || '';
  };

  drawHeader('Step 1 : Site URL');

  let siteUrl = '';
  while (!siteUrl) {
    const input: string = await ask('Enter the site URL');
    try {
      new URL(input);
      siteUrl = input;
    } catch {
      console.log(`  ${chalk.red('✗')} ${chalk.red('Invalid URL. Enter a valid URL (https://...)')}\n`);
    }
  }
  console.log(`  ${chalk.green('✓')} ${chalk.green('URL:')} ${chalk.underline(siteUrl)}\n`);

  drawHeader('Step 2 : Platform');

  const detected = detectPlatform(siteUrl);
  let platformName: PlatformType;

  if (legacyMode) {
    console.log(`  ${chalk.blue('i')} Auto-detected: ${chalk.magenta(detected.displayName)}`);
    const platformInput: string = await ask('Platform (framer/webflow/wix)', detected.name);
    platformName = (['framer', 'webflow', 'wix'].includes(platformInput)
      ? platformInput
      : detected.name) as PlatformType;
    console.log(`  ${chalk.green('✓')} ${chalk.green('Platform:')} ${chalk.magenta(platformName)}\n`);
  } else {
    rl.close();
    const platforms = [
      { label: `Framer${detected.name === 'framer' ? chalk.gray(' (detected)') : ''}`, value: 'framer' },
      { label: `Webflow${detected.name === 'webflow' ? chalk.gray(' (detected)') : ''}`, value: 'webflow' },
      { label: `Wix${detected.name === 'wix' ? chalk.gray(' (detected)') : ''}`, value: 'wix' },
    ];
    const defaultIdx = ['framer', 'webflow', 'wix'].indexOf(detected.name);
    platformName = await select('Select platform', platforms, Math.max(0, defaultIdx)) as PlatformType;
  }

  const rl2 = legacyMode ? rl : readline.createInterface({ input: stdin, output: stdout });

  const ask2 = async (question: string, defaultVal?: string): Promise<string> => {
    const suffix: string = defaultVal ? chalk.gray(` (${defaultVal})`) : '';
    const prompt: string = `  ${chalk.cyan('?')} ${chalk.white.bold(question)}${suffix} ${chalk.gray('>')} `;
    const answer: string = await rl2.question(prompt);
    return answer.trim() || defaultVal || '';
  };

  const derivedName: string = deriveOutputName(siteUrl, platformName);

  drawHeader('Step 3 : Output Directory');

  const outDir: string = await ask2('Output directory', './' + derivedName);
  console.log(`  ${chalk.green('✓')} ${chalk.green('Output:')} ${chalk.yellow(outDir)}\n`);

  drawHeader('Step 4 : Options');

  let prettyPrint: boolean;
  let concurrency: number;

  if (legacyMode) {
    const prettyAnswer: string = await ask2('Pretty-print JS files? (y/n)', 'y');
    prettyPrint = prettyAnswer.toLowerCase().startsWith('y');
    console.log(`  ${chalk.green('✓')} Pretty-print: ${prettyPrint ? chalk.green('yes') : chalk.red('no')}\n`);

    const concurrencyAnswer: string = await ask2('Download concurrency', '12');
    concurrency = parseInt(concurrencyAnswer, 10) || 12;
    console.log(`  ${chalk.green('✓')} Concurrency: ${chalk.yellow(String(concurrency))}\n`);
  } else {
    rl2.close();
    const prettyVal = await select('Pretty-print JS files?', [
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' },
    ]);
    prettyPrint = prettyVal === 'yes';

    const concurrencyVal = await select('Download concurrency', [
      { label: '6 (slow connection)', value: '6' },
      { label: '12 (default)', value: '12' },
      { label: '20 (fast connection)', value: '20' },
    ], 1);
    concurrency = parseInt(concurrencyVal, 10);
  }

  console.log('');
  const width = getWidth();
  const isSmall = width < 50;
  if (!isSmall) {
    console.log(chalk.magenta('  ┌─────────────────────────────────────────────┐'));
    console.log(chalk.magenta('  │') + chalk.bold.white('  Summary                                     ') + chalk.magenta('│'));
    console.log(chalk.magenta('  ├─────────────────────────────────────────────┤'));
  } else {
    console.log(chalk.bold.white('  Summary:'));
  }
  line('URL', siteUrl);
  line('Platform', platformName);
  line('Output', path.resolve(outDir));
  line('Pretty-print', prettyPrint ? 'yes' : 'no');
  line('Concurrency', String(concurrency));
  if (!isSmall) {
    console.log(chalk.magenta('  └─────────────────────────────────────────────┘'));
  }
  console.log('');

  let startExport: boolean;

  if (legacyMode) {
    const confirm: string = await ask2('Start export? (y/n)', 'y');
    startExport = confirm.toLowerCase().startsWith('y');
    rl2.close();
  } else {
    const confirmVal = await select('Start export?', [
      { label: 'Yes, start now', value: 'yes' },
      { label: 'Cancel', value: 'no' },
    ]);
    startExport = confirmVal === 'yes';
  }

  if (!startExport) {
    console.log(`\n  ${chalk.yellow('Export cancelled.')}\n`);
    return;
  }

  console.log('');

  const { CFG } = await import('../config/index.js');
  CFG.concurrency = concurrency;

  const exporter = new FramerExporter(siteUrl, path.resolve(outDir), platformName);
  exporter.prettyPrint = prettyPrint;
  await exporter.run();
}
