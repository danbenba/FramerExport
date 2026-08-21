import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import path from 'node:path';
import { URL } from 'node:url';
import chalk from 'chalk';
import { showBanner } from './banner.js';
import { FramerExporter, deriveOutputName } from '../exporter/index.js';
import { detectPlatform, getPlatformByName, PLATFORM_REGISTRY } from '../platforms/index.js';
import { promptInput, select } from './select.js';
import { selectTool, resolveDetected } from './select-grouped.js';
import type { PlatformType } from '../platforms/types.js';
import { chip, ui } from './theme.js';

function checkbox(checked: boolean): string {
  return checked ? '[✓]' : '[ ]';
}

const CONCURRENCY_STEPS = [6, 12, 20];

export async function runSetup(legacyMode: boolean = false): Promise<void> {
  showBanner();

  console.log(`  ${ui.text.bold('Framer Export setup')} ${chip('interactive')}`);
  console.log(
    `  ${ui.muted('Export 25+ website platforms into a clean, self-hosted local mirror.')}\n`
  );

  if (legacyMode) {
    return runLegacySetup();
  }

  let platformName: PlatformType | null = null;
  let autoDetect = false;

  const tool = await selectTool();
  if ('auto' in tool) autoDetect = true;
  else platformName = tool.platform;

  let siteUrl = '';
  let urlError = '';
  while (!siteUrl) {
    const headerLines = [
      autoDetect
        ? 'Tool: auto-detect from URL'
        : `Tool: ${getPlatformByName(platformName!).displayName}`,
      urlError,
    ].filter(Boolean);
    const input = await promptInput('Enter the site URL', '', { headerLines });
    try {
      new URL(input);
      siteUrl = input;
      urlError = '';
    } catch {
      urlError = 'Invalid URL. Enter a valid URL (https://...)';
    }
  }

  if (autoDetect) {
    platformName = detectPlatform(siteUrl).name;
  } else {
    const detected = resolveDetected(siteUrl);
    if (detected && detected !== platformName) {
      const detectedName = getPlatformByName(detected).displayName;
      const chosenName = getPlatformByName(platformName!).displayName;
      const answer = await select(
        'URL looks like a different platform',
        [
          { label: `Switch to ${detectedName} (detected)`, value: 'switch' },
          { label: `Keep ${chosenName}`, value: 'keep' },
        ],
        0,
        { headerLines: [`URL: ${siteUrl}`] }
      );
      if (answer === 'switch') platformName = detected;
    }
  }

  const derivedName = deriveOutputName(siteUrl, platformName!);
  let outDir = './' + derivedName;
  outDir = await promptInput('Output directory', outDir, {
    headerLines: [`URL: ${siteUrl}`, `Tool: ${getPlatformByName(platformName!).displayName}`],
  });

  let prettyPrint = true;
  let concurrency = 12;
  let includeSubpages = false;
  let startExport = false;
  let focusIndex = 0;

  options: while (true) {
    const summary = [
      `URL       ${siteUrl}`,
      `Tool      ${getPlatformByName(platformName!).displayName}`,
      `Output    ${path.resolve(outDir)}`,
    ];
    const choice = await select(
      'Export options',
      [
        { label: `${checkbox(prettyPrint)}  Pretty-print JS files`, value: 'pretty' },
        { label: `${checkbox(includeSubpages)}  Export sub-pages`, value: 'subpages' },
        {
          label: `[${String(concurrency).padStart(2)}]  Download concurrency`,
          value: 'concurrency',
        },
      ],
      focusIndex,
      {
        headerLines: summary,
        actions: [
          { label: 'Start export', value: 'start' },
          { label: 'Back', value: 'back' },
          { label: 'Cancel', value: 'cancel' },
        ],
        footer: 'enter toggle   tab actions   mouse click   esc close',
      }
    );

    switch (choice) {
      case 'pretty':
        prettyPrint = !prettyPrint;
        focusIndex = 0;
        continue;
      case 'subpages':
        includeSubpages = !includeSubpages;
        focusIndex = 1;
        continue;
      case 'concurrency': {
        const idx = CONCURRENCY_STEPS.indexOf(concurrency);
        concurrency = CONCURRENCY_STEPS[(idx + 1) % CONCURRENCY_STEPS.length];
        focusIndex = 2;
        continue;
      }
      case 'back':
        outDir = await promptInput('Output directory', outDir, {
          headerLines: [`URL: ${siteUrl}`],
        });
        focusIndex = 0;
        continue;
      case 'start':
        startExport = true;
        break options;
      default:
        startExport = false;
        break options;
    }
  }

  if (!startExport) {
    console.log(`\n  ${ui.warning('Export cancelled.')}\n`);
    return;
  }

  console.log('');
  await launchExport(siteUrl, outDir, platformName!, {
    prettyPrint,
    concurrency,
    includeSubpages,
  });
}

async function runLegacySetup(): Promise<void> {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  const ask = async (question: string, defaultVal?: string): Promise<string> => {
    const suffix = defaultVal ? chalk.gray(` (${defaultVal})`) : '';
    const prompt = `  ${ui.primary('●')} ${ui.text.bold(question)}${suffix} ${ui.muted('>')} `;
    const answer = await rl.question(prompt);
    return answer.trim() || defaultVal || '';
  };

  const platformInput = await ask('Tool (platform id, or "auto")', 'auto');
  const known = PLATFORM_REGISTRY.some((platform) => platform.name === platformInput);

  let siteUrl = '';
  while (!siteUrl) {
    const input = await ask('Enter the site URL');
    try {
      new URL(input);
      siteUrl = input;
    } catch {
      console.log(
        `  ${ui.error('✗')} ${ui.error('Invalid URL. Enter a valid URL (https://...)')}\n`
      );
    }
  }

  const platformName = (known ? platformInput : detectPlatform(siteUrl).name) as PlatformType;
  console.log(`  ${ui.success('✓')} ${ui.success('Tool:')} ${ui.primary(platformName)}\n`);

  const outDir = await ask('Output directory', './' + deriveOutputName(siteUrl, platformName));

  const prettyAnswer = await ask('Pretty-print JS files? (y/n)', 'y');
  const prettyPrint = prettyAnswer.toLowerCase().startsWith('y');

  const subpagesAnswer = await ask('Export sub-pages? (y/n)', 'n');
  const includeSubpages = subpagesAnswer.toLowerCase().startsWith('y');

  const concurrencyAnswer = await ask('Download concurrency', '12');
  const concurrency = parseInt(concurrencyAnswer, 10) || 12;

  const confirm = await ask('Start export? (y/n)', 'y');
  rl.close();

  if (!confirm.toLowerCase().startsWith('y')) {
    console.log(`\n  ${ui.warning('Export cancelled.')}\n`);
    return;
  }

  console.log('');
  await launchExport(siteUrl, outDir, platformName, {
    prettyPrint,
    concurrency,
    includeSubpages,
  });
}

async function launchExport(
  siteUrl: string,
  outDir: string,
  platformName: PlatformType,
  opts: { prettyPrint: boolean; concurrency: number; includeSubpages: boolean }
): Promise<void> {
  const { CFG } = await import('../config/index.js');
  CFG.concurrency = opts.concurrency;

  const exporter = new FramerExporter(siteUrl, path.resolve(outDir), platformName);
  exporter.prettyPrint = opts.prettyPrint;
  try {
    await exporter.run(opts.includeSubpages);
  } catch (e) {
    const { AntiBotError, formatAntiBotError } = await import('../exporter/anti-bot.js');
    if (e instanceof AntiBotError) {
      console.log(formatAntiBotError(e));
      process.exit(1);
    }
    throw e;
  }
}
