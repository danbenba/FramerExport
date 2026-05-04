import { showBanner } from './banner.js';
import { chip, ui } from './theme.js';

export function showHelp(): void {
  showBanner();

  console.log(`${ui.text.bold('  USAGE')} ${chip('cli')}\n`);
  console.log(
    `    ${ui.primary('framer-export')} ${ui.warning('<url>')} ${ui.muted('[output-dir]')}`
  );
  console.log(
    `    ${ui.primary('fexport')}         ${ui.warning('<url>')} ${ui.muted('[output-dir]')}`
  );

  console.log('');
  console.log(ui.text.bold('  OPTIONS\n'));

  const opts: Array<[string, string]> = [
    ['--setup', 'Launch the interactive setup assistant'],
    ['--platform <p>', 'Force platform: framer, webflow, wix'],
    ['--subpages', 'Crawl and export sub-pages'],
    ['--legacy-mode', 'Use text input instead of arrow selection'],
    ['--help, -h', 'Show this help message'],
  ];

  for (const [flag, desc] of opts) {
    console.log(`    ${ui.success(flag.padEnd(18))} ${ui.text(desc)}`);
  }

  console.log('');
  console.log(ui.text.bold('  SUPPORTED PLATFORMS\n'));

  const platforms: Array<[string, string]> = [
    ['Framer', 'Auto-detected via .framer.app / .framer.website URLs'],
    ['Webflow', 'Auto-detected via .webflow.io URLs'],
    ['Wix', 'Auto-detected via .wixsite.com URLs + HTML analysis'],
  ];

  for (const [name, desc] of platforms) {
    console.log(`    ${ui.primary(name.padEnd(12))} ${ui.muted(desc)}`);
  }

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
