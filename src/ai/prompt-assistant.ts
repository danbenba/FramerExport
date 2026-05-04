import fs from 'fs/promises';
import path from 'path';
import { stdin, stdout } from 'node:process';
import { spawn } from 'node:child_process';
import type { ExporterContext } from '../types.js';
import { select, type SelectOption } from '../cli/select.js';
import { boxTop, boxLine, boxSep, boxBot, maxWidth } from '../cli/box.js';
import { stripAnsi, ui } from '../cli/theme.js';

interface ConversionTarget {
  id: string;
  label: string;
  stack: string;
  projectDir: string;
  staticDir: string;
  scaffold: string;
  entryFiles: string;
  routing: string;
}

interface AiTool {
  id: string;
  label: string;
  displayName: string;
  agentName: string;
}

interface ConversionGoal {
  id: string;
  label: string;
  instruction: string;
  priority: string;
}

interface ExportFacts {
  sourceUrl: string;
  outputDir: string;
  platformName: string;
  rootEntries: string[];
  counts: Record<string, number>;
}

const IMPORTANT_DIRS = [
  'index.html',
  'styles',
  'scripts/vendor',
  'scripts/modules',
  'assets/images',
  'assets/videos',
  'assets/fonts',
  'assets/misc',
  'data',
  'subpages',
];

const AI_TOOLS: AiTool[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    displayName: 'Claude Code',
    agentName: 'Claude Code',
  },
  {
    id: 'codex',
    label: 'Codex',
    displayName: 'Codex',
    agentName: 'Codex coding agent',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    displayName: 'OpenCode',
    agentName: 'OpenCode',
  },
  {
    id: 'other-ai',
    label: 'Other AI coding agent',
    displayName: 'Other AI',
    agentName: 'AI coding agent',
  },
];

const TARGETS: ConversionTarget[] = [
  {
    id: 'react-vite',
    label: 'React + Vite + TypeScript',
    stack: 'React 18/19, TypeScript, Vite, CSS modules or plain CSS',
    projectDir: 'converted-react-vite',
    staticDir: 'public',
    scaffold: 'npm create vite@latest converted-react-vite -- --template react-ts',
    entryFiles: 'src/main.tsx, src/App.tsx, src/components/*, src/styles/*',
    routing: 'Use React Router only if multiple exported pages exist in subpages/.',
  },
  {
    id: 'nextjs-app-router',
    label: 'Next.js App Router',
    stack: 'Next.js App Router, TypeScript, React Server Components where useful',
    projectDir: 'converted-nextjs',
    staticDir: 'public',
    scaffold: 'npx create-next-app@latest converted-nextjs --ts --app --eslint',
    entryFiles: 'app/page.tsx, app/layout.tsx, components/*, public/*',
    routing: 'Map exported subpages to app routes and keep shared layout code reusable.',
  },
  {
    id: 'vue-vite',
    label: 'Vue + Vite + TypeScript',
    stack: 'Vue 3, TypeScript, Vite, single-file components',
    projectDir: 'converted-vue-vite',
    staticDir: 'public',
    scaffold: 'npm create vite@latest converted-vue-vite -- --template vue-ts',
    entryFiles: 'src/main.ts, src/App.vue, src/components/*.vue, src/styles/*',
    routing: 'Use Vue Router only if multiple exported pages exist in subpages/.',
  },
  {
    id: 'sveltekit',
    label: 'SvelteKit',
    stack: 'SvelteKit, TypeScript, componentized routes and assets',
    projectDir: 'converted-sveltekit',
    staticDir: 'static',
    scaffold: 'npm create svelte@latest converted-sveltekit',
    entryFiles: 'src/routes/+page.svelte, src/lib/components/*, static/*',
    routing: 'Create SvelteKit routes for meaningful exported pages when subpages/ exists.',
  },
  {
    id: 'astro',
    label: 'Astro',
    stack: 'Astro, TypeScript, island components only where interactivity is needed',
    projectDir: 'converted-astro',
    staticDir: 'public',
    scaffold: 'npm create astro@latest converted-astro',
    entryFiles: 'src/pages/index.astro, src/components/*, public/*',
    routing: 'Use Astro pages for exported subpages and avoid unnecessary client JavaScript.',
  },
];

const GOALS: ConversionGoal[] = [
  {
    id: 'clean-rebuild',
    label: 'Clean professional rebuild',
    instruction:
      'Rebuild the export as clean production code, not as a one-file HTML clone, while preserving the full page experience.',
    priority: 'Readable structure, maintainability, complete pages, and faithful visual result.',
  },
  {
    id: 'pixel-perfect',
    label: 'Pixel-perfect visual migration',
    instruction:
      'Prioritize pixel-perfect fidelity before refactoring anything aggressively, even when the layout is difficult.',
    priority:
      'Spacing, typography, responsive behavior, colors, media, animations, and page-by-page fidelity.',
  },
  {
    id: 'component-system',
    label: 'Reusable component system',
    instruction:
      'Extract repeated UI blocks into reusable components with clean props without simplifying the original pages.',
    priority:
      'Components, layout primitives, naming, future editability, and complete section coverage.',
  },
  {
    id: 'performance-seo',
    label: 'Performance and SEO rebuild',
    instruction:
      'Rebuild the site while reducing unused vendor code and improving SEO basics without losing visual fidelity.',
    priority:
      'Fast loading, semantic markup, metadata, accessibility, asset hygiene, and faithful pages.',
  },
];

export async function runAiPromptAssistant(exporter: ExporterContext): Promise<void> {
  if (!stdin.isTTY || !stdout.isTTY) return;

  printConvertPanel(exporter);
  const action = await select(
    'Framer Export AI Convert',
    [
      { label: `${buttonLabel('Convert')} open AI prompt modal`, value: 'convert' },
      { label: `${buttonLabel('Skip')} finish export`, value: 'skip' },
    ],
    0
  );
  if (action === 'skip') return;

  printAssistantModal('AI conversion prompt', [
    'Choose a target stack, AI tool, and conversion situation.',
    'Mouse clicks are supported in the terminal when available.',
    'A detailed prompt file will be generated inside the export folder.',
  ]);

  const targetOptions: SelectOption[] = [
    ...TARGETS.map((target) => ({ label: target.label, value: target.id })),
    { label: 'Customize with AI - BETA in development', value: 'custom-ai', disabled: true },
  ];

  const targetId = await select('Choose target stack', targetOptions, 0);

  const aiToolId = await select(
    'Choose the AI coding tool',
    AI_TOOLS.map((tool) => ({ label: tool.label, value: tool.id })),
    0
  );

  const goalId = await select(
    'Choose the conversion situation',
    GOALS.map((goal) => ({ label: goal.label, value: goal.id })),
    0
  );

  const target = TARGETS.find((item) => item.id === targetId) || TARGETS[0];
  const aiTool = AI_TOOLS.find((item) => item.id === aiToolId) || AI_TOOLS[0];
  const goal = GOALS.find((item) => item.id === goalId) || GOALS[0];
  const facts = await collectExportFacts(exporter);
  const prompt = buildConversionPrompt(target, aiTool, goal, facts);
  const aiDir = path.join(exporter.outDir, 'ai');
  const promptPath = path.join(aiDir, `${aiTool.id}-${target.id}-${goal.id}-prompt.md`);

  await fs.mkdir(aiDir, { recursive: true });
  await fs.writeFile(promptPath, prompt, 'utf-8');

  printPromptResult(promptPath, target, aiTool, goal);

  const promptAction = await select(
    'Prompt actions',
    [
      { label: `${buttonLabel('Copy prompt')} clipboard`, value: 'copy' },
      { label: `${buttonLabel('Done')} keep file only`, value: 'done' },
    ],
    0
  );

  if (promptAction === 'copy') {
    try {
      await copyToClipboard(prompt);
      console.log(`  ${ui.success('✓')} ${ui.text.bold('Prompt copied to clipboard')}\n`);
    } catch (error) {
      console.log(
        `  ${ui.warning('!')} ${ui.warning('Clipboard copy unavailable:')} ${ui.muted((error as Error).message)}\n`
      );
    }
  }
}

async function collectExportFacts(exporter: ExporterContext): Promise<ExportFacts> {
  const counts: Record<string, number> = {};
  const rootEntries = await safeReadDir(exporter.outDir);

  for (const item of IMPORTANT_DIRS) {
    counts[item] =
      item === 'index.html'
        ? (await exists(path.join(exporter.outDir, item)))
          ? 1
          : 0
        : await countEntries(path.join(exporter.outDir, item));
  }

  return {
    sourceUrl: exporter.siteUrl,
    outputDir: exporter.outDir,
    platformName: exporter.platform.displayName,
    rootEntries,
    counts,
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function safeReadDir(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).sort();
  } catch {
    return [];
  }
}

async function countEntries(dir: string): Promise<number> {
  try {
    return (await fs.readdir(dir)).length;
  } catch {
    return 0;
  }
}

function buttonLabel(label: string): string {
  return `${ui.border('[')} ${ui.text.bold(label)} ${ui.border(']')}`;
}

function centerText(text: string, width: number): string {
  const visible = stripAnsi(text).length;
  if (visible >= width) return text;
  const left = Math.floor((width - visible) / 2);
  return ' '.repeat(left) + text + ' '.repeat(width - visible - left);
}

function printConvertPanel(exporter: ExporterContext): void {
  const w = maxWidth();
  const inner = w - 4;
  const rows = [
    centerText(`${ui.text.bold('AI Convert')} ${ui.muted('BETA')}`, inner),
    centerText(ui.muted('Generate a conversion prompt after the export.'), inner),
    centerText(`${buttonLabel('Convert')} ${ui.muted('or')} ${buttonLabel('Skip')}`, inner),
    centerText(ui.muted(path.basename(exporter.outDir)), inner),
  ];

  console.log('');
  console.log(boxTop(w));
  for (const row of rows) console.log(boxLine(w, row));
  console.log(boxBot(w));
  console.log('');
}

function printAssistantModal(title: string, lines: string[]): void {
  const w = maxWidth();
  const inner = w - 4;

  console.log('');
  console.log(boxTop(w));
  console.log(boxLine(w, centerText(`${ui.primary('◆')} ${ui.text.bold(title)}`, inner)));
  console.log(boxSep(w));
  for (const line of lines) {
    console.log(boxLine(w, centerText(ui.muted(line), inner)));
  }
  console.log(boxBot(w));
  console.log('');
}

function buildConversionPrompt(
  target: ConversionTarget,
  aiTool: AiTool,
  goal: ConversionGoal,
  facts: ExportFacts
): string {
  const rootEntries = facts.rootEntries.length
    ? facts.rootEntries.join(', ')
    : 'No root entries detected';
  const exportDir = quoteForPrompt(facts.outputDir);
  const projectDir = quoteForPrompt(path.join(facts.outputDir, target.projectDir));
  const scaffoldCommand = `cd ${exportDir}; ${target.scaffold}`;
  const sourceAssets = quoteForPrompt(path.join(facts.outputDir, 'assets', '*'));
  const destinationAssets = quoteForPrompt(
    path.join(facts.outputDir, target.projectDir, target.staticDir, 'assets')
  );
  const windowsAssetCopyCommand = `New-Item -ItemType Directory -Force -Path ${destinationAssets}; Copy-Item -Path ${sourceAssets} -Destination ${destinationAssets} -Recurse -Force`;
  const unixSourceAssets = quoteForPrompt(toPosixPath(path.join(facts.outputDir, 'assets')));
  const unixDestinationParent = quoteForPrompt(
    toPosixPath(path.join(facts.outputDir, target.projectDir, target.staticDir))
  );
  const unixAssetCopyCommand = `mkdir -p ${unixDestinationParent} && cp -R ${unixSourceAssets} ${unixDestinationParent}/assets`;
  const directoryLines = IMPORTANT_DIRS.map(
    (dir) => `Inspect ${dir}: ${facts.counts[dir]} item(s) detected in the export.`
  );
  const promptLines = [
    `You are ${aiTool.agentName} working inside a local export created by Framer Export.`,
    'This brief was generated by the Framer Export AI Prompt Assistant BETA.',
    'Treat this beta prompt as a strict conversion checklist, not as permission to skip inspection.',
    'Your mission is to convert this exported static mirror into a clean production project.',
    `Target stack: ${target.stack}.`,
    `Selected AI coding tool: ${aiTool.displayName}.`,
    `Selected conversion situation: ${goal.label}.`,
    `Primary instruction for this situation: ${goal.instruction}`,
    `Main priority: ${goal.priority}`,
    `Source URL from the real export: ${facts.sourceUrl}`,
    `Detected platform from the real export: ${facts.platformName}`,
    `Export folder to inspect first: ${facts.outputDir}`,
    `Root entries actually present: ${rootEntries}`,
    `Create the converted project in: ${projectDir}`,
    `Recommended scaffold command: ${scaffoldCommand}`,
    `Expected important target files: ${target.entryFiles}`,
    `Routing guidance: ${target.routing}`,
    `Static assets destination for this stack: ${target.staticDir}/assets inside the converted project.`,
    `PowerShell command to copy exported assets after scaffolding: ${windowsAssetCopyCommand}`,
    `macOS/Linux command to copy exported assets after scaffolding: ${unixAssetCopyCommand}`,
    'Run the asset copy command; do not recreate, redownload, rename randomly, or replace real exported assets with placeholders.',
    'After copying assets, update every image, video, font, CSS url(), and script reference to the new local asset path.',
    'Do not rush. Take time to inspect the export before writing the final implementation.',
    'Do not invent brand names, copy, images, links, animations, colors, or sections.',
    'Use only real information found in index.html, CSS files, JavaScript files, data files, and assets.',
    'If a detail is missing, inspect more files instead of guessing.',
    'If a vendor script is minified or hard to understand, identify what behavior it provides before replacing it.',
    'Keep the final result professional, clean, responsive, and maintainable.',
    'Do not simplify the site because a section, animation, page, or layout is difficult.',
    'If something is hard, break it into smaller components and keep working until the result matches closely.',
    'For every exported page, aim for the closest possible pixel-perfect result: spacing, typography, images, viewport behavior, and motion.',
    'Do not merge multiple pages into one generic page unless the export proves they are duplicate routes.',
    'Do not replace complex exported sections with summaries, cards, screenshots, or placeholder blocks.',
    'If a page has visual depth, overlapping layers, sticky sections, galleries, or scroll effects, recreate those behaviors instead of flattening them.',
    'Start by listing the files and directories that matter for the conversion.',
    ...directoryLines,
    'Read index.html fully enough to understand page structure, metadata, linked assets, and scripts.',
    'Read the CSS files that define layout, typography, responsive rules, and visual details.',
    'Inspect scripts/vendor only to understand required interactions; do not blindly copy huge vendor bundles.',
    'Inspect scripts/modules for page-specific logic, animations, sliders, menus, and dynamic behavior.',
    'Inspect data files for CMS-like content, page data, configuration, or serialized props.',
    'Inspect assets/images and preserve the real image files that are actually used.',
    'Inspect assets/fonts and preserve font loading if the design depends on custom fonts.',
    'Inspect subpages if it contains exported pages; map them to routes only when they represent real pages.',
    'If subpages contains pages, convert each meaningful page with its own route and page component.',
    'For each converted page, compare against the original exported HTML route and adjust until it is visually close.',
    'Create a clean project structure instead of dumping everything into one component.',
    'Separate global layout, page sections, shared components, data helpers, and styles.',
    'Use semantic HTML for headings, navigation, buttons, forms, sections, and footer content.',
    'Preserve the original hierarchy of visible content unless there is a clear bug to fix.',
    'Preserve real URLs and links, but convert local asset paths to the new project structure.',
    'Move static assets into the target framework public/static asset location when appropriate.',
    'Do not keep broken CDN references if a local exported asset already exists.',
    'Do not hardcode absolute machine paths into source files; use framework-relative public asset paths after copying.',
    'Keep original filenames when possible so CSS and content references remain traceable.',
    'Do not leave unused analytics, editor badges, platform badges, or export-only scripts in the new app.',
    'Replace platform-specific runtime code with native framework components when possible.',
    'Keep interactions that users can see: menus, hover states, forms, sliders, animations, and scroll effects.',
    'If an interaction is too complex, implement a clean equivalent and document the difference briefly.',
    'Keep responsive behavior for desktop, tablet, and mobile.',
    'Check layout at small widths and avoid fixed desktop-only dimensions unless the original requires them.',
    'Use CSS variables or a clear theme file for colors, spacing, radius, shadows, and typography.',
    'Name components after their role: Hero, Header, FeatureGrid, Gallery, Pricing, Footer, and similar real sections.',
    'Avoid generic placeholder components if the exported site has specific section meaning.',
    'Use TypeScript types where they make the content or component props clearer.',
    'Do not add unnecessary libraries unless they replace a real exported behavior cleanly.',
    'If you add a library, explain why it is needed and where it is used.',
    'Keep package.json scripts standard: dev, build, preview, lint when available.',
    'Keep the build reproducible from a fresh install.',
    'After implementing, run the install/build/typecheck commands available for the target project.',
    'Fix any build errors instead of leaving TODOs.',
    'Open the generated app locally if possible and compare against the exported index.html visually.',
    'When there are subpages, compare every generated route against its matching exported file.',
    'Verify that every visible image loads from the new project.',
    'Verify that font rendering is close to the export.',
    'Verify that navigation and internal links work.',
    'Verify that responsive breakpoints do not overlap or hide important content.',
    'Verify that there are no console errors caused by missing assets or copied platform scripts.',
    'Keep accessibility basics: alt text when inferable, keyboard-reachable controls, visible focus states.',
    'Keep SEO basics: title, meta description if present, canonical only if it is correct, Open Graph when present.',
    'Do not fabricate SEO copy; reuse existing metadata or ask for missing copy if necessary.',
    'Commit to a small number of high-quality files rather than many noisy fragments.',
    'If a section repeats, extract a reusable component and data array.',
    'If a section is unique, keep it simple and local to the page.',
    'Document important migration decisions in a short README inside the converted project.',
    'The README must mention the source export folder, target stack, setup command, and known limitations.',
    'Do not delete the original export folder.',
    'Do not modify unrelated files outside the new converted project unless required for setup.',
    'If the worktree has existing changes, avoid reverting or overwriting them.',
    'Before large edits, inspect first and explain the conversion plan briefly.',
    'Then implement the conversion step by step until the app builds.',
    'Final answer must summarize what was converted, where the new project lives, and which checks passed.',
    'If something could not be converted, state the exact file or behavior and the reason.',
    'Quality bar: the result should feel like a real hand-built production app, not an automated scrape or simplified demo.',
  ];

  return [
    `# ${aiTool.displayName} Conversion Prompt - ${target.label}`,
    '',
    'Status: BETA assistant output. Review the export carefully and follow the real files.',
    `Generated from real export: ${facts.outputDir}`,
    `AI tool: ${aiTool.displayName}`,
    `Target: ${target.label}`,
    `Situation: ${goal.label}`,
    '',
    promptLines.map((line, index) => `${String(index + 1).padStart(2, '0')}. ${line}`).join('\n'),
    '',
  ].join('\n');
}

function quoteForPrompt(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/');
}

async function copyToClipboard(text: string): Promise<void> {
  const commands =
    process.platform === 'win32'
      ? [{ command: 'clip', args: [] }]
      : process.platform === 'darwin'
        ? [{ command: 'pbcopy', args: [] }]
        : [
            { command: 'wl-copy', args: [] },
            { command: 'xclip', args: ['-selection', 'clipboard'] },
            { command: 'xsel', args: ['--clipboard', '--input'] },
          ];

  let lastError: Error | null = null;
  for (const item of commands) {
    try {
      await pipeToCommand(item.command, item.args, text);
      return;
    } catch (error) {
      lastError = error as Error;
    }
  }

  throw lastError || new Error('No clipboard command found');
}

function pipeToCommand(command: string, args: string[], input: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';
    let settled = false;

    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', finish);
    child.on('close', (code) => {
      if (code === 0) {
        finish();
      } else {
        finish(new Error(`${command} exited with ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
      }
    });
    child.stdin?.end(input);
  });
}

function printPromptResult(
  promptPath: string,
  target: ConversionTarget,
  aiTool: AiTool,
  goal: ConversionGoal
): void {
  const w = maxWidth();
  const isSmall = w < 50;
  const inner = w - 4;
  const relPath = path.relative(process.cwd(), promptPath) || promptPath;

  console.log('');
  if (!isSmall) {
    console.log(boxTop(w));
    console.log(
      boxLine(
        w,
        centerText(
          `${ui.success('✓')} ${ui.text.bold('AI Prompt Ready')} ${ui.muted('BETA')}`,
          inner
        )
      )
    );
    console.log(boxSep(w));
    console.log(
      boxLine(w, centerText(`${ui.muted('Tool')} ${ui.primary(aiTool.displayName)}`, inner))
    );
    console.log(boxLine(w, centerText(`${ui.muted('Stack')} ${ui.primary(target.label)}`, inner)));
    console.log(boxLine(w, centerText(`${ui.muted('Mode')} ${ui.primary(goal.label)}`, inner)));
    console.log(boxLine(w, centerText(`${ui.muted('File')} ${ui.primary(relPath)}`, inner)));
    console.log(boxSep(w));
    console.log(
      boxLine(w, centerText(`${buttonLabel('Copy prompt')} ${buttonLabel('Done')}`, inner))
    );
    console.log(boxBot(w));
  } else {
    console.log(ui.text.bold('  AI Prompt Ready - BETA'));
    console.log(`  Tool: ${ui.primary(aiTool.displayName)}`);
    console.log(`  Stack: ${ui.primary(target.label)}`);
    console.log(`  Situation: ${ui.primary(goal.label)}`);
    console.log(`  File: ${ui.primary(relPath)}`);
  }
  console.log('');
}
