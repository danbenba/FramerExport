import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import path from 'node:path';
import { URL } from 'node:url';
import chalk from 'chalk';
import { showBanner } from './banner.js';
import { FramerExporter, deriveOutputName } from '../exporter/index.js';
import { detectPlatform, PLATFORM_REGISTRY } from '../platforms/index.js';
import { promptInput, select } from './select.js';
import { selectPlatform } from './select-grouped.js';
import type { PlatformType } from '../platforms/types.js';
import { boxTop, boxLine, boxSep, boxBot, boxRow, maxWidth } from './box.js';
import { bullet, chip, ui } from './theme.js';

function drawHeader(title: string): void {
  const w = maxWidth();
  if (w < 50) {
    console.log(`\n  ${bullet('●')} ${ui.text.bold(title)}`);
    return;
  }
  console.log(boxTop(w));
  console.log(boxLine(w, ui.text.bold('  ' + title)));
  console.log(boxBot(w));
  console.log('');
}

export async function runSetup(legacyMode: boolean = false): Promise<void> {
  showBanner();

  console.log(`  ${ui.text.bold('Framer Export setup')} ${chip('interactive')}`);
  console.log(
    `  ${ui.muted('Export 25+ website platforms into a clean, self-hosted local mirror.')}\n`
  );

  const rl = legacyMode ? readline.createInterface({ input: stdin, output: stdout }) : null;

  const ask = async (
    question: string,
    defaultVal?: string,
    headerLines: string[] = []
  ): Promise<string> => {
    if (!legacyMode) {
      return promptInput(question, defaultVal || '', { headerLines });
    }

    const suffix: string = defaultVal ? chalk.gray(` (${defaultVal})`) : '';
    const prompt: string = `  ${ui.primary('●')} ${ui.text.bold(question)}${suffix} ${ui.muted('>')} `;
    const answer: string = await rl!.question(prompt);
    return answer.trim() || defaultVal || '';
  };

  if (legacyMode) drawHeader('Step 1 : Site URL');

  let siteUrl = '';
  let urlError = '';
  while (!siteUrl) {
    const input: string = await ask(
      'Enter the site URL',
      '',
      ['Step 1 : Site URL', urlError].filter(Boolean)
    );
    try {
      new URL(input);
      siteUrl = input;
      urlError = '';
    } catch {
      urlError = 'Invalid URL. Enter a valid URL (https://...)';
      if (legacyMode) {
        console.log(`  ${ui.error('✗')} ${ui.error(urlError)}\n`);
      }
    }
  }
  if (legacyMode) {
    console.log(`  ${ui.success('✓')} ${ui.success('URL:')} ${chalk.underline(siteUrl)}\n`);
  }

  let platformName: PlatformType | null = null;

  if (legacyMode) {
    drawHeader('Step 2 : Platform');
    const detected = detectPlatform(siteUrl);
    console.log(`  ${ui.info('i')} Auto-detected: ${ui.primary(detected.displayName)}`);
    const platformInput: string = await ask('Platform name', detected.name);
    const known = PLATFORM_REGISTRY.some((platform) => platform.name === platformInput);
    platformName = (known ? platformInput : detected.name) as PlatformType;
    console.log(`  ${ui.success('✓')} ${ui.success('Platform:')} ${ui.primary(platformName)}\n`);
  } else {
    while (!platformName) {
      const selection = await selectPlatform(siteUrl);

      if ('modifyUrl' in selection) {
        siteUrl = '';
        urlError = '';
        while (!siteUrl) {
          const input = await ask(
            'Modify site URL',
            '',
            ['Step 1 : Site URL', urlError].filter(Boolean)
          );
          try {
            new URL(input);
            siteUrl = input;
            urlError = '';
          } catch {
            urlError = 'Invalid URL. Enter a valid URL (https://...)';
          }
        }
        continue;
      }

      platformName = selection.platform;
    }
  }

  if (!platformName) {
    throw new Error('Platform selection failed');
  }

  const rl2 = legacyMode ? rl! : null;

  const ask2 = async (
    question: string,
    defaultVal?: string,
    headerLines: string[] = []
  ): Promise<string> => {
    if (!legacyMode) {
      return promptInput(question, defaultVal || '', { headerLines });
    }

    const suffix: string = defaultVal ? chalk.gray(` (${defaultVal})`) : '';
    const prompt: string = `  ${ui.primary('●')} ${ui.text.bold(question)}${suffix} ${ui.muted('>')} `;
    const answer: string = await rl2!.question(prompt);
    return answer.trim() || defaultVal || '';
  };

  const derivedName: string = deriveOutputName(siteUrl, platformName);
  let outDir = './' + derivedName;

  if (legacyMode) {
    drawHeader('Step 3 : Output Directory');
    outDir = await ask2('Output directory', outDir, [
      'Step 3 : Output Directory',
      `URL: ${siteUrl}`,
      `Platform: ${platformName}`,
    ]);
    console.log(`  ${ui.success('✓')} ${ui.success('Output:')} ${ui.primary(outDir)}\n`);
    drawHeader('Step 4 : Options');
  } else {
    outDir = await ask2('Output directory', outDir, [
      'Step 3 : Output Directory',
      `URL: ${siteUrl}`,
      `Platform: ${platformName}`,
    ]);
  }

  let prettyPrint = true;
  let concurrency = 12;
  let includeSubpages = false;
  let startExport = false;

  const summaryRows = (): Array<[string, string]> => [
    ['URL', siteUrl],
    ['Platform', platformName],
    ['Output', path.resolve(outDir)],
    ['Pretty-print', prettyPrint ? 'yes' : 'no'],
    ['Sub-pages', includeSubpages ? 'yes' : 'no'],
    ['Concurrency', String(concurrency)],
  ];

  const summaryLines = (): string[] => summaryRows().map(([label, value]) => `${label}: ${value}`);

  const printSummary = (): void => {
    const w = maxWidth();
    const isSmall = w < 50;
    console.log('');
    if (!isSmall) {
      console.log(boxTop(w));
      console.log(boxLine(w, ui.text.bold('  Summary')));
      console.log(boxSep(w));
    } else {
      console.log(ui.text.bold('  Summary:'));
    }

    for (const [label, value] of summaryRows()) {
      console.log(boxRow(w, label, value));
    }

    if (!isSmall) {
      console.log(boxBot(w));
    }
    console.log('');
  };

  if (legacyMode) {
    const prettyAnswer: string = await ask2('Pretty-print JS files? (y/n)', 'y');
    prettyPrint = prettyAnswer.toLowerCase().startsWith('y');
    console.log(
      `  ${ui.success('✓')} Pretty-print: ${prettyPrint ? ui.success('yes') : ui.error('no')}\n`
    );

    const subpagesAnswer: string = await ask2('Export sub-pages? (y/n)', 'n');
    includeSubpages = subpagesAnswer.toLowerCase().startsWith('y');
    console.log(
      `  ${ui.success('✓')} Sub-pages: ${includeSubpages ? ui.success('yes') : ui.error('no')}\n`
    );

    const concurrencyAnswer: string = await ask2('Download concurrency', '12');
    concurrency = parseInt(concurrencyAnswer, 10) || 12;
    console.log(`  ${ui.success('✓')} Concurrency: ${ui.primary(String(concurrency))}\n`);

    printSummary();

    const confirm: string = await ask2('Start export? (y/n)', 'y');
    startExport = confirm.toLowerCase().startsWith('y');
    rl2!.close();
  } else {
    let optionStep = 0;

    while (true) {
      while (optionStep < 3) {
        if (optionStep === 0) {
          const prettyVal = await select(
            'Pretty-print JS files?',
            [
              { label: 'Yes', value: 'yes' },
              { label: 'No', value: 'no' },
            ],
            prettyPrint ? 0 : 1,
            {
              headerLines: ['Step 4 : Options'],
              actions: [{ label: 'Previous: output directory', value: 'previous' }],
              footer: 'previous go back  ·  enter next  ·  mouse hover/click',
            }
          );

          if (prettyVal === 'previous') {
            outDir = await ask2('Output directory', outDir, [
              'Step 3 : Output Directory',
              `URL: ${siteUrl}`,
              `Platform: ${platformName}`,
            ]);
            optionStep = 0;
            continue;
          }

          prettyPrint = prettyVal === 'yes';
          optionStep = 1;
          continue;
        }

        if (optionStep === 1) {
          const subpagesVal = await select(
            'Export sub-pages?',
            [
              { label: 'No', value: 'no' },
              { label: 'Yes, crawl and export', value: 'yes' },
            ],
            includeSubpages ? 1 : 0,
            {
              headerLines: ['Step 4 : Options'],
              actions: [{ label: 'Previous: pretty-print', value: 'previous' }],
              footer: 'previous go back  ·  enter next  ·  mouse hover/click',
            }
          );

          if (subpagesVal === 'previous') {
            optionStep = 0;
            continue;
          }

          includeSubpages = subpagesVal === 'yes';
          optionStep = 2;
          continue;
        }

        const concurrencyVal = await select(
          'Download concurrency',
          [
            { label: '6 (slow connection)', value: '6' },
            { label: '12 (default)', value: '12' },
            { label: '20 (fast connection)', value: '20' },
          ],
          concurrency === 6 ? 0 : concurrency === 20 ? 2 : 1,
          {
            headerLines: ['Step 4 : Options'],
            actions: [{ label: 'Previous: sub-pages', value: 'previous' }],
            footer: 'previous go back  ·  enter next  ·  mouse hover/click',
          }
        );

        if (concurrencyVal === 'previous') {
          optionStep = 1;
          continue;
        }

        concurrency = parseInt(concurrencyVal, 10);
        optionStep = 3;
      }

      const confirmVal = await select(
        'Ready to export?',
        [
          { label: 'Previous: edit options', value: 'previous' },
          { label: 'Next: start now', value: 'next' },
          { label: 'Cancel', value: 'cancel' },
        ],
        1,
        {
          headerLines: ['Summary', ...summaryLines()],
          footer: 'previous edit options  ·  next start export  ·  mouse hover/click',
        }
      );

      if (confirmVal === 'previous') {
        optionStep = 2;
        continue;
      }
      startExport = confirmVal === 'next';
      break;
    }
  }

  if (!startExport) {
    console.log(`\n  ${ui.warning('Export cancelled.')}\n`);
    return;
  }

  console.log('');

  const { CFG } = await import('../config/index.js');
  CFG.concurrency = concurrency;

  const exporter = new FramerExporter(siteUrl, path.resolve(outDir), platformName);
  exporter.prettyPrint = prettyPrint;
  try {
    await exporter.run(includeSubpages);
  } catch (e) {
    const { AntiBotError, formatAntiBotError } = await import('../exporter/anti-bot.js');
    if (e instanceof AntiBotError) {
      console.log(formatAntiBotError(e));
      process.exit(1);
    }
    throw e;
  }
}
