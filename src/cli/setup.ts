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
import { boxTop, boxLine, boxSep, boxBot, boxRow, maxWidth } from './box.js';

function drawHeader(title: string): void {
  const w = maxWidth();
  if (w < 50) {
    console.log(`\n  ${chalk.hex('#D4A017')('●')} ${chalk.bold.white(title)}`);
    return;
  }
  console.log(boxTop(w));
  console.log(boxLine(w, chalk.bold.white('  ' + title)));
  console.log(boxBot(w));
  console.log('');
}

export async function runSetup(legacyMode: boolean = false): Promise<void> {
  showBanner();

  console.log(chalk.bold.white('  Welcome to Framer Export setup.\n'));
  console.log(chalk.gray('  Supports Framer, Webflow, and Wix sites.\n'));

  const rl = readline.createInterface({ input: stdin, output: stdout });

  const ask = async (question: string, defaultVal?: string): Promise<string> => {
    const suffix: string = defaultVal ? chalk.gray(` (${defaultVal})`) : '';
    const prompt: string = `  ${chalk.hex('#D4A017')('?')} ${chalk.white.bold(question)}${suffix} ${chalk.gray('>')} `;
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
    console.log(`  ${chalk.blue('i')} Auto-detected: ${chalk.hex('#D4A017')(detected.displayName)}`);
    const platformInput: string = await ask('Platform (framer/webflow/wix)', detected.name);
    platformName = (['framer', 'webflow', 'wix'].includes(platformInput)
      ? platformInput
      : detected.name) as PlatformType;
    console.log(`  ${chalk.green('✓')} ${chalk.green('Platform:')} ${chalk.hex('#D4A017')(platformName)}\n`);
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
    const prompt: string = `  ${chalk.hex('#D4A017')('?')} ${chalk.white.bold(question)}${suffix} ${chalk.gray('>')} `;
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
  let includeSubpages: boolean;

  if (legacyMode) {
    const prettyAnswer: string = await ask2('Pretty-print JS files? (y/n)', 'y');
    prettyPrint = prettyAnswer.toLowerCase().startsWith('y');
    console.log(`  ${chalk.green('✓')} Pretty-print: ${prettyPrint ? chalk.green('yes') : chalk.red('no')}\n`);

    const subpagesAnswer: string = await ask2('Export sub-pages? (y/n)', 'n');
    includeSubpages = subpagesAnswer.toLowerCase().startsWith('y');
    console.log(`  ${chalk.green('✓')} Sub-pages: ${includeSubpages ? chalk.green('yes') : chalk.red('no')}\n`);

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

    const subpagesVal = await select('Export sub-pages?', [
      { label: 'No', value: 'no' },
      { label: 'Yes, crawl and export', value: 'yes' },
    ], 0);
    includeSubpages = subpagesVal === 'yes';

    const concurrencyVal = await select('Download concurrency', [
      { label: '6 (slow connection)', value: '6' },
      { label: '12 (default)', value: '12' },
      { label: '20 (fast connection)', value: '20' },
    ], 1);
    concurrency = parseInt(concurrencyVal, 10);
  }

  const w = maxWidth();
  const isSmall = w < 50;
  const G = chalk.hex('#C4953A');
  const B = chalk.hex('#8B6914');

  console.log('');
  if (!isSmall) {
    console.log(boxTop(w));
    console.log(boxLine(w, chalk.bold.white('  Summary')));
  } else {
    console.log(chalk.bold.white('  Summary:'));
  }

  for (const [label, value] of [
    ['URL', siteUrl],
    ['Platform', platformName],
    ['Output', path.resolve(outDir)],
    ['Pretty-print', prettyPrint ? 'yes' : 'no'],
    ['Sub-pages', includeSubpages ? 'yes' : 'no'],
    ['Concurrency', String(concurrency)],
  ]) {
    console.log(boxRow(w, label, value));
  }

  if (!isSmall) {
    console.log(boxBot(w));
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
  await exporter.run(includeSubpages);
}
