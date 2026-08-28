import { showBanner } from './banner.js';
import { chip, ui } from './theme.js';
import {
  platformsByCategory,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  isBetaPlatform,
} from '../platforms/index.js';

export function showHelp(): void {
  showBanner();

  console.log(`${ui.text.bold('  USAGE')} ${chip('cli')}\n`);
  console.log(
    `    ${ui.primary('framer-export')} ${ui.warning('<url>')} ${ui.muted('[output-dir]')}`
  );
  console.log(
    `    ${ui.primary('fexport')}         ${ui.warning('<url>')} ${ui.muted('[output-dir]')}`
  );
  console.log(
    `    ${ui.primary('framer-export')} ${ui.success('ui')}   ${ui.muted('[--port <n>] [--no-open]')}`
  );

  console.log('');
  console.log(ui.text.bold('  OPTIONS\n'));

  const opts: Array<[string, string]> = [
    ['ui', 'Launch the web interface (gallery, options, live logs)'],
    ['--setup', 'Launch the interactive setup assistant'],
    ['--platform <p>', 'Force platform by id (e.g. framer, shopify, notion)'],
    ['--subpages', 'Crawl and export sub-pages'],
    ['--dpr <number>', 'Capture device pixel ratio (default: 1)'],
    ['--legacy-mode', 'With --setup: use text input instead of arrow selection'],
    ['--about', 'Show version and package information'],
    ['--version, -v', 'Show the version number'],
    ['--help, -h', 'Show this help message'],
  ];

  for (const [flag, desc] of opts) {
    console.log(`    ${ui.success(flag.padEnd(18))} ${ui.text(desc)}`);
  }

  console.log('');
  console.log(ui.text.bold('  SUPPORTED PLATFORMS\n'));

  const grouped = platformsByCategory();
  for (const cat of CATEGORY_ORDER) {
    const names = grouped[cat]
      .map((handler) => handler.displayName + (isBetaPlatform(handler.name) ? '*' : ''))
      .join(', ');
    console.log(`    ${ui.primary(CATEGORY_LABELS[cat].padEnd(22))} ${ui.muted(names)}`);
  }
  console.log(`    ${ui.muted('* beta support, all other platforms are stable')}`);

  console.log('');
  console.log(ui.text.bold('  EXAMPLES\n'));
  console.log(
    `    ${ui.muted('$')} ${ui.primary('framer-export')} ${ui.warning('https://mysite.framer.app')}`
  );
  console.log(
    `    ${ui.muted('$')} ${ui.primary('framer-export')} ${ui.warning('https://mysite.webflow.io')}`
  );
  console.log(
    `    ${ui.muted('$')} ${ui.primary('framer-export')} ${ui.warning('https://user.wixsite.com/my-site')}`
  );
  console.log(
    `    ${ui.muted('$')} ${ui.primary('framer-export')} ${ui.success('--platform webflow')} ${ui.warning('https://custom.com')}`
  );
  console.log(
    `    ${ui.muted('$')} ${ui.primary('framer-export')} ${ui.success('--subpages')} ${ui.warning('https://mysite.com')}`
  );
  console.log(`    ${ui.muted('$')} ${ui.primary('framer-export')} ${ui.success('--setup')}`);
  console.log(
    `    ${ui.muted('$')} ${ui.primary('framer-export')} ${ui.success('--setup --legacy-mode')}`
  );
  console.log('');
}
