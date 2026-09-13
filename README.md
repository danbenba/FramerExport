<h1 align="center">F-EXPORT</h1>

<p align="center">
  <img src="https://img.shields.io/badge/version-5.0.0-blue" alt="Version" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
  <img src="https://img.shields.io/badge/node-%3E%3D20-339933" alt="Node" />
</p>

<p align="center">Export a site built on Framer, Webflow, Wix or 22 other platforms into a local folder that actually works.</p>

## What this is

You have a site on a hosted platform. You want the real files: the HTML as the browser sees it, the CSS, the scripts, the images, the fonts, the videos. Not a screenshot, not a broken "save page as" folder, an actual mirror you can open locally, host anywhere, or hand to an AI agent to rebuild as a clean codebase.

That is what framer-export does. It loads the page in a headless browser, waits for the framework to hydrate, captures the rendered result, downloads every asset it can find, rewrites all the CDN URLs to local relative paths, strips the platform badges and trackers, and writes a folder with a small `serve.js` so you can preview it immediately.

It knows 25 platforms and detects the right one from the URL, and when the URL is a custom domain it falls back to reading the HTML. If a site sits behind Cloudflare or a captcha, the export fails loudly with an explanation instead of giving you an empty folder.

## Installation

```bash
npm install -g framer-export
```

Version 5.0.0 uses the stable `latest` channel. You can also install the validated local package with `npm install -g ./framer-export-5.0.0.tgz`. Preview releases remain available through `framer-export@beta`.

Or from source:

```bash
git clone https://github.com/danbenba/FramerExport.git
cd FramerExport
npm install
```

Node 20 or newer. Installation downloads Chrome for Testing through Puppeteer, which takes a moment. Version 5 updates the bundled browser to Chrome 148; the old Chrome 127 was rejected by current Notion pages.

## Three ways to run it

### The web interface

```bash
framer-export ui
```

This starts a local server on port 4400 and opens your browser. The four steps are Select provider, Site details, Options and Review. Browse the provider icons in cards or a list, search and change pages, then paste the URL and choose export options. Completed steps remain clickable and retain your input. Settings and Help open in dialogs, with hover hints on controls. The export screen shows progress and a file summary; View logs opens an editor-style dialog with line numbers, search, level filters, automatic following and copying.

The server only listens on 127.0.0.1 and rejects cross-origin requests, so nothing on the network or in another browser tab can trigger exports on your machine. Use `--port <n>` to change the port and `--no-open` if you do not want the browser to open by itself.

### The terminal wizard

```bash
framer-export
```

Running it with no arguments opens the same four-step workflow in the terminal. Provider names, descriptions, logos and colors are shared with the web interface. Cards use pagination; the list adds a draggable scrollbar. Completed steps show a checkmark; Back and the step links let you change earlier details without retyping later ones. Settings, Help and Open UI use dialogs that preserve the underlying step, with hover states and contextual hints.

The first launch includes a short introduction. Preferences and an unfinished export draft are stored in `~/.fexport`; relaunching restores your place. Use `--fresh` for a new draft. All 25 provider icons are bundled for offline use; their original files and provenance are in [assets/provider-icons](assets/provider-icons/SOURCES.md).

The lowercase `framerexport` wordmark fits a standard 80×24 terminal and switches to compact text in smaller windows. Both interfaces use graphite surfaces, a peach accent and a restrained PixelBlast background. The terminal adapts the background to character cells; native image modes keep that background still to avoid repeatedly repainting images.

Provider logos use native images when the terminal supports Kitty graphics, iTerm inline images or detected Sixel graphics with known cell dimensions. Unsupported terminals, multiplexers and disabled image mode use colored monograms with provider names. Set `FEXPORT_TERMINAL_IMAGES=0` to force this fallback. Font metrics, graphics protocols and available colors belong to the terminal, so its physical pixels cannot be guaranteed identical to a browser. Layout and image placement stay within the viewport, including compact windows, and adjust on resize.

| Input                        | Action                   |
| ---------------------------- | ------------------------ |
| Tab / Shift+Tab              | Move between controls    |
| Arrow keys / Enter           | Browse and select        |
| Esc / Alt+Left               | Go back                  |
| Mouse wheel / scrollbar drag | Scroll content           |
| Page Up / Page Down          | Change provider pages    |
| Ctrl+A / Ctrl+U              | Select or clear a field  |
| `,` / `?`                    | Preferences / shortcuts  |
| Ctrl+C                       | Save the draft and leave |

Wizard exports open a dedicated log viewer with line numbers, timestamps, log levels, progress counters and a scrollbar. Use `/` to search, `f` to cycle level filters, `p` to pause following, `c` to copy the full log, and the arrow keys to scroll vertically or pan across long lines. Home goes to the first entry and End resumes following new entries. Search and filters leave the saved log unchanged; wizard exports retain the full session even beyond 5,000 entries.

In both interfaces, scrolling up pauses automatic following so you can read earlier entries. Latest logs returns to the newest entry and resumes following. Severity colors distinguish information, successes, warnings and errors; active progress has a subtle shine that respects reduced motion. The terminal paints only changed cells and preserves native icons between updates.

Enter closes the viewer after the export completes or fails. Esc or Ctrl+C during an export returns to console output while the operation continues; a second Ctrl+C in the console stops the process. A failed export remains marked as failed and returns its original error after the viewer closes. Direct commands and legacy prompts retain the compact console output and optional progress sidebar.

If arrow keys do not work in your terminal, `framer-export --setup --legacy-mode` falls back to plain text prompts.

### Preferences

Run `fexport settings` to edit preferences, or `fexport config` to print their file location and current values. Both interfaces use the same `~/.fexport/settings.json`:

```json
{
  "schemaVersion": 1,
  "defaultProvider": "auto",
  "launchUi": false,
  "checkUpdates": true,
  "autoInstallUpdates": false,
  "betaUpdates": false,
  "viewMode": "cards",
  "reduceMotion": false,
  "onboardingCompleted": false,
  "prettyPrint": true,
  "includeSubpages": false,
  "concurrency": 12
}
```

`launchUi` starts a separate local web process alongside the terminal and closes it when the terminal exits. Updates are checked at most once a day. Automatic installation is opt-in and preserves a supported npm installation's local/global scope. Source checkouts, npx and other package managers receive instructions instead. Beta updates are opt-in; a stable release takes precedence over an older prerelease.

Motion is enabled by default. Enable `reduceMotion` for a still terminal background and reduced web animations; the web interface also respects the operating system's reduced-motion preference. `FRAMER_EXPORT_NO_BG=1` disables the terminal background. Reset program asks for confirmation before removing preferences, the saved draft and the update cache. It restores the welcome screen and keeps exported folders, unrelated files and configuration backups.

Settings writes are atomic. An invalid settings file uses defaults and is preserved until an explicit save. `FEXPORT_HOME` overrides the directory for isolated environments. `fexport doctor` reports the terminal capabilities, bundled browser installation and update channel without downloading anything. `--no-update` skips the check for one launch.

### The direct command

```bash
framer-export https://mysite.framer.app
framer-export https://mysite.webflow.io ./my-export
framer-export --platform webflow https://my-custom-domain.com
framer-export --subpages https://mysite.framer.app
```

Auto-detection covers the hosted domains (`.framer.app`, `.webflow.io`, `.wixsite.com` and so on). For custom domains, pass `--platform` with the platform id, or let the HTML detection figure it out.

## CLI reference

```
framer-export <url> [output-dir]      export a site
framer-export ui [--port <n>]         launch the web interface
framer-export --setup                 launch the terminal wizard
framer-export settings                edit persistent preferences
framer-export config                  show preferences as JSON
framer-export doctor                  inspect terminal and browser availability

--platform <id>    force a platform (framer, webflow, wix, shopify, notion, ...)
--subpages         crawl internal links and export every page
--dpr <number>     capture device pixel ratio, default 1
--legacy-mode      with --setup, use plain text prompts
--no-open          with ui, do not open the browser
--fresh            start setup without restoring the saved draft
--no-update        skip the update check for this launch
--about            version and package information
--version, -v      version number
--help, -h         full help with the platform list
```

## Supported platforms

Website builders: Framer, Webflow, Wix, Bubble, Carrd, Strikingly, Duda, Squarespace, Weebly, Tilda.

Landing page tools: ClickFunnels, Instapage, Unbounce, Systeme.io, Elementor.

CMS: Notion, Ghost, WordPress.

Course platforms: Kajabi, Teachable, Thinkific, Podia.

E-commerce: Gumroad, Shopify.

AI builders: Gamma.

Platform detection covers all 25 handlers. Rendering and offline behavior depend on the source site; detection alone does not establish visual fidelity. Bubble, Notion and Podia are marked beta because they use static snapshots to preserve rendered content. Their original application scripts are removed, so hosted account flows, dashboards and other application interactions need a separate implementation. Notion may also fail to load because of upstream availability or access restrictions.

The beta 4 regression suite compares complete local exports with their source at desktop and mobile sizes, with the source server stopped. It checks fonts, responsive images, dynamic styles, navigation and local form behavior. No export recreates a platform's account database, payment backend or form processing service.

Each platform is a single self-contained handler in `src/platforms/`. It declares how to detect the platform, which domains and selectors to strip, how long to wait for hydration, how to route assets into folders, and optional hooks that run before capture, after capture and after the build. Adding a platform never touches the others.

## What you get

```
framer-mysite-fresh-build-a1b2/
  index.html          the rendered page, URLs rewritten to local paths
  serve.js            a small static server with SPA fallback
  package.json        so "npm run serve" works
  export.log          the complete log of the run
  export-report.json  missing assets, capture mode and functional limitations
  styles/             CSS files
  scripts/vendor/     third-party bundles
  scripts/modules/    page modules and lazy chunks
  assets/images/      images, responsive variants included
  assets/fonts/       font files
  assets/videos/      video files
  assets/misc/        everything else
  data/               JSON and data files
  subpages/           one HTML file per crawled page, when --subpages is on
```

To preview it:

```bash
cd framer-mysite-fresh-build-a1b2
node serve.js
```

The site has to be served over HTTP because module scripts do not load from `file://`. The bundled server handles MIME types, CORS headers and the sub-page fallback, so a route like `/about` resolves to `subpages/about.html` automatically.

Every run writes `export.log` with untruncated messages from its retained log history. The terminal wizard's log viewer and the web interface offer clipboard copying, which is handy when reporting a problem or passing context to another tool.

## The AI conversion assistant

After a direct-command or legacy terminal export you can generate a conversion brief for an AI coding agent. Pick a target stack (React with Vite, Next.js, Vue, SvelteKit or Astro), pick the tool you use (Claude Code, Codex, OpenCode or another agent), pick a goal (clean rebuild, pixel-perfect migration, component system, or performance and SEO), and it writes a detailed prompt file into `ai/` inside the export. The prompt references the real files and counts from your export, so the agent starts from facts instead of guesses. The modern wizard finishes in its log viewer.

## How it works

The pipeline has six phases. First it fetches the server-rendered HTML over plain HTTP, which is what search engines see and what gives the cleanest markup. Then it launches Puppeteer, blocks the analytics domains the platform handler lists, navigates, waits for the hydration selector, scrolls through the page to trigger lazy loading, and records every network response into an asset map. Sub-page crawling reuses the same browser session when enabled.

The capture also serializes styles added through CSSOM rules and constructed stylesheets. Once the browser closes, the downloader writes unique assets with a configurable concurrency and follows CSS imports and resource URLs, including fonts and images only used at other breakpoints. Redirected stylesheets retain their correct URL base; assets with identical filenames or different query parameters remain distinct. Lazy JavaScript imports are resolved where possible. The build step localizes captured resources, preserves relative navigation, strips badges and trackers, and writes `index.html`, `serve.js`, `export.log` and `export-report.json`.

## When something goes wrong

If a site is protected by Cloudflare, hCaptcha or a similar challenge, the export stops with a clear message rather than saving the challenge page as if it were the site. There is no bypass built in; run the export from a network the site trusts, or use a platform-hosted URL instead of the proxied custom domain.

If the page comes out incomplete, try `--dpr 2` for sharper image variants, or check the log for `Download failed` lines. Some platforms serve assets from session-bound URLs that expire; re-running the export usually resolves it.

If detection picks the wrong platform on a custom domain, pass `--platform` explicitly. Detection priorities are conservative on purpose: a hosted domain always wins over a generator meta tag.

## Development

```bash
npm run dev
npm test
npm run test:browser
npm run test:platform -- webflow https://smallshop.webflow.io/
npm run typecheck
npm run build
npm run format
```

The test suite covers platform detection for all 25 handlers against recorded research profiles, asset mapping, URL rewriting, the logger, the generated serve.js (spawned for real and probed over HTTP), the progress state and every route of the UI server, including its origin and host checks.

Terminal tests run the actual CLI in a pseudoterminal and interpret its output with xterm. They exercise onboarding, mouse/keyboard input, draft restoration, live resizing, companion server cleanup, log search/filtering and completed or detached export lifecycles. Unit tests also check Unicode cell widths, grapheme editing, terminal image protocol generation and rendering bounds down to a 1×1 cell buffer. This is a clipping check, not a claim that a full interface is readable in one cell; protocol tests do not establish identical native image rendering in every terminal emulator.

The interface work draws on [Microsoft's terminal sequences](https://learn.microsoft.com/en-us/windows/console/console-virtual-terminal-sequences), [xterm's supported sequences](https://xtermjs.org/docs/api/vtfeatures/), [Ink](https://github.com/vadimdemedes/ink), [Bubble Tea](https://github.com/charmbracelet/bubbletea) and Apple's guidance on [onboarding](https://developer.apple.com/design/human-interface-guidelines/onboarding) and [scroll views](https://developer.apple.com/design/human-interface-guidelines/scroll-views). The existing ANSI input layer remains in use with a clipped cell renderer; xterm and node-pty are development tools rather than runtime UI dependencies.

To add a platform, create one file in `src/platforms/<category>/`, implement the `PlatformHandler` interface, register it in `src/platforms/registry.ts`, and add a research profile in `tests/research/` so the detection tests cover it. Look at `src/platforms/builder/carrd.ts` for a small example and `src/platforms/framer.ts` for a complete one.

Commits follow the conventional format: `feat(scope):`, `fix(scope):`, `test:`, `docs:`, `chore:`.

### Publishing

Run release commands from the source checkout with development dependencies installed. Full publication runs TypeScript checks, unit tests, browser tests and the build before uploading to the stable `latest` channel:

```bash
npm run release
```

Publish the already built package directly, without tests or a build:

```bash
npm run release -- --bypass-tests
```

`--bypass-tests` belongs to the project's release script; `--bypass-checks` is an alias. This mode uploads the existing `dist` bundle as-is. It is equivalent to `npm publish --ignore-scripts`, using [npm's option to skip lifecycle scripts](https://docs.npmjs.com/cli/v11/using-npm/config/#ignore-scripts). To preview that direct upload:

```bash
npm run release -- --bypass-tests --dry-run
```

Arguments after `--`, such as `--dry-run` or `--otp=123456`, are forwarded to npm publish. The default release command checks and builds once; its final upload skips lifecycle scripts. Ordinary `npm publish` still runs the full check suite through `prepublishOnly`, then builds through `prepare`, following [npm's lifecycle order](https://docs.npmjs.com/cli/v11/using-npm/scripts/#npm-publish).

Use `npm run check` to validate without publishing, or `npm pack` to build `framer-export-5.0.0.tgz`. Publish that already built archive with `npm publish ./framer-export-5.0.0.tgz --tag latest`.

## License

MIT. See [LICENSE](LICENSE).

Built by [Dany (danbenba)](https://github.com/danbenba).
