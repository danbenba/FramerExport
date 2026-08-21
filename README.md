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

Or from source:

```bash
git clone https://github.com/danbenba/FramerExport.git
cd FramerExport
npm install
```

Node 20 or newer. The first run downloads a Chromium build for Puppeteer, which takes a moment.

## Three ways to run it

### The web interface

```bash
framer-export ui
```

This starts a local server on port 4400 and opens your browser. You get a gallery of every supported platform. Click one (or pick auto-detect), paste the URL, adjust the options, and watch the export run with live logs on the left and a summary panel on the right showing the current phase, asset counters and the last files written. When it finishes you can copy the full log or the serve command with one click.

The server only listens on 127.0.0.1 and rejects cross-origin requests, so nothing on the network or in another browser tab can trigger exports on your machine. Use `--port <n>` to change the port and `--no-open` if you do not want the browser to open by itself.

### The terminal wizard

```bash
framer-export
```

Running it with no arguments opens the interactive setup. First you pick the tool from a scrollable list grouped by category, then you enter the URL, then the output directory, and finally a single options panel with checkboxes for pretty-printing and sub-pages, plus a concurrency setting. If the URL looks like a different platform than the one you picked, it asks before continuing.

While the export runs, terminals wider than 100 columns get a live sidebar on the right with the phase, elapsed time, download counters and recent files. The log stream itself stays untouched.

If arrow keys do not work in your terminal, `framer-export --setup --legacy-mode` falls back to plain text prompts.

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

--platform <id>    force a platform (framer, webflow, wix, shopify, notion, ...)
--subpages         crawl internal links and export every page
--dpr <number>     capture device pixel ratio, default 1
--legacy-mode      with --setup, use plain text prompts
--no-open          with ui, do not open the browser
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

Each platform is a single self-contained handler in `src/platforms/`. It declares how to detect the platform, which domains and selectors to strip, how long to wait for hydration, how to route assets into folders, and optional hooks that run before capture, after capture and after the build. Adding a platform never touches the others.

## What you get

```
framer-mysite-fresh-build-a1b2/
  index.html          the rendered page, URLs rewritten to local paths
  serve.js            a small static server with SPA fallback
  package.json        so "npm run serve" works
  export.log          the complete log of the run
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

Every run also writes `export.log` with the full untruncated log history. The finish panel in the terminal and the web interface both offer to copy it to the clipboard, which is handy when you want to report a problem or feed the context to an AI tool.

## The AI conversion assistant

After a terminal export you can generate a conversion brief for an AI coding agent. Pick a target stack (React with Vite, Next.js, Vue, SvelteKit or Astro), pick the tool you use (Claude Code, Codex, OpenCode or another agent), pick a goal (clean rebuild, pixel-perfect migration, component system, or performance and SEO), and it writes a detailed prompt file into `ai/` inside the export. The prompt references the real files and counts from your export, so the agent starts from facts instead of guesses.

## How it works

The pipeline has six phases. First it fetches the server-rendered HTML over plain HTTP, which is what search engines see and what gives the cleanest markup. Then it launches Puppeteer, blocks the analytics domains the platform handler lists, navigates, waits for the hydration selector, scrolls through the page to trigger lazy loading, and records every network response into an asset map. Sub-page crawling reuses the same browser session when enabled.

Once the browser closes, the downloader writes all unique assets to disk with a configurable concurrency, then follows `import` statements inside downloaded JS chunks to resolve lazily loaded modules the browser never requested. The build step rewrites every URL to a local relative path, strips badges, trackers and integrity attributes, injects canonical and Open Graph tags when they are missing, pretty-prints the JavaScript unless you turned that off, and writes `index.html`, `serve.js` and `export.log`.

## When something goes wrong

If a site is protected by Cloudflare, hCaptcha or a similar challenge, the export stops with a clear message rather than saving the challenge page as if it were the site. There is no bypass built in; run the export from a network the site trusts, or use a platform-hosted URL instead of the proxied custom domain.

If the page comes out incomplete, try `--dpr 2` for sharper image variants, or check the log for `Download failed` lines. Some platforms serve assets from session-bound URLs that expire; re-running the export usually resolves it.

If detection picks the wrong platform on a custom domain, pass `--platform` explicitly. Detection priorities are conservative on purpose: a hosted domain always wins over a generator meta tag.

## Development

```bash
npm run dev          # run the CLI from source
npm test             # 150 unit and integration tests, node test runner
npm run typecheck    # tsc --noEmit
npm run build        # bundle with tsup into dist/
npm run format       # prettier over src/
```

The test suite covers platform detection for all 25 handlers against recorded research profiles, asset mapping, URL rewriting, the logger, the generated serve.js (spawned for real and probed over HTTP), the progress state and every route of the UI server, including its origin and host checks.

To add a platform, create one file in `src/platforms/<category>/`, implement the `PlatformHandler` interface, register it in `src/platforms/registry.ts`, and add a research profile in `tests/research/` so the detection tests cover it. Look at `src/platforms/builder/carrd.ts` for a small example and `src/platforms/framer.ts` for a complete one.

Commits follow the conventional format: `feat(scope):`, `fix(scope):`, `test:`, `docs:`, `chore:`.

## License

MIT. See [LICENSE](LICENSE).

Built by [Dany (danbenba)](https://github.com/danbenba).
