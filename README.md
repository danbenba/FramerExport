<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Puppeteer-40B5A4?style=for-the-badge&logo=puppeteer&logoColor=white" alt="Puppeteer" />
  <img src="https://img.shields.io/badge/version-4.0.0-blue?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="License" />
</p>

<h1 align="center">
  <br />
  F-EXPORT
  <br />
  <sub>Framer &middot; Webflow &middot; Wix Exporter</sub>
</h1>

<p align="center">
  <b>Export any Framer, Webflow, or Wix site into a fully working local mirror.</b><br/>
  All assets, animations, fonts, videos, and scripts — downloaded, rewritten, and pretty-printed.<br/>
  Badges and tracking removed. Ready to serve.
</p>

<p align="center">
  <a href="#-features">Features</a> &middot;
  <a href="#-quick-start">Quick Start</a> &middot;
  <a href="#-platforms">Platforms</a> &middot;
  <a href="#-cli-reference">CLI</a> &middot;
  <a href="#-architecture">Architecture</a> &middot;
  <a href="#-contributing">Contributing</a> &middot;
  <a href="#-license">License</a>
</p>

---

## &#x2728; Features

| Feature | Description |
|---------|-------------|
| **Multi-Platform** | Auto-detects Framer, Webflow, and Wix sites from the URL |
| **Full Mirror** | Downloads HTML, CSS, JS, images, fonts, and videos |
| **Badge Removal** | Strips "Made in Webflow", Wix ads banner, Framer badge |
| **URL Rewriting** | All CDN URLs rewritten to local relative paths |
| **Pretty-Print** | Minified JS/MJS files reformatted with Prettier |
| **Integrity Strip** | Removes `integrity` and `crossorigin` attributes for local serving |
| **SEO Optimization** | Injects canonical, OG tags, and robots meta if missing |
| **Interactive Setup** | Arrow-key wizard with platform detection and progress animation |
| **Cooking Animation** | Shimmer gradient progress indicator during export |
| **Local Server** | Built-in serve.cjs with SPA fallback and CORS headers |
| **Smart Naming** | Output folder auto-named from URL (e.g. `webflow-mysite/`) |

## &#x1F680; Quick Start

```bash
# Clone and install
git clone https://github.com/danbenba/f-export.git
cd f-export
npm install

# Interactive mode (recommended)
npm run dev

# Direct export
npm run dev -- https://mysite.framer.app
npm run dev -- https://mysite.webflow.io
npm run dev -- https://user.wixsite.com/my-site

# Serve the exported site
cd webflow-mysite && node serve.cjs
```

## &#x1F310; Platforms

### Framer
- Auto-detected via `.framer.app`, `.framer.website`, `.framer.ai`
- Handles framerusercontent.com, framerstatic.com, framercanvas.com
- Strips Framer badge, analytics events, bootstrap scripts
- Waits for SPA hydration (`#main` element)

### Webflow
- Auto-detected via `.webflow.io`, `.webflow.com`
- Handles cdn.prod.website-files.com, cloudfront CDN, GSAP plugins
- Strips "Made in Webflow" badge, "Powered by" footer, `data-wf-*` attributes
- Removes generator meta tag and HTML comments
- Downloads videos (MP4/WebM) and responsive image variants

### Wix
- Auto-detected via `.wixsite.com`, `.wix.com`
- Handles static.wixstatic.com, static.parastorage.com, video.wixstatic.com
- Strips WIX_ADS banner (nested div with SVG), wix-ads class, wix-badge
- Blocks frog.wix.com, panorama.wixapps.net analytics
- Preserves 40+ inline `<style>` tags (Wix architecture)

## &#x1F4BB; CLI Reference

```
Usage:
  cooksite <url> [output-dir]
  cooksite --setup
  cooksite --setup --legacy-mode

Options:
  --setup            Launch interactive setup wizard
  --platform <name>  Force platform: framer | webflow | wix
  --legacy-mode      Use y/n text input instead of arrow selection
  --help, -h         Show help message
```

### Examples

```bash
# Auto-detect platform from URL
cooksite https://mysite.framer.app

# Force platform for custom domains
cooksite --platform webflow https://custom-domain.com

# Specify output directory
cooksite https://mysite.webflow.io ./my-export

# Interactive wizard with arrow-key selection
cooksite --setup

# Legacy mode (y/n prompts)
cooksite --setup --legacy-mode
```

### npm Scripts

```bash
npm run dev       # Run with tsx (development)
npm start         # Same as dev
npm run build     # Bundle with tsup
npm run typecheck # Type-check with tsc
npm run format    # Format with Prettier
```

## &#x1F4C1; Output Structure

```
webflow-mysite/
├── index.html           # Main page (URLs rewritten, badges stripped)
├── serve.cjs            # Local HTTP server with SPA fallback
├── styles/              # CSS files
├── scripts/
│   ├── vendor/          # Platform JS modules (pretty-printed)
│   └── modules/         # Component modules
├── assets/
│   ├── images/          # PNG, JPG, SVG, WebP, AVIF
│   ├── videos/          # MP4, WebM
│   ├── fonts/           # WOFF2, WOFF, TTF, OTF
│   └── misc/            # Other assets
└── data/                # CMS data, JSON, search index
```

## &#x1F3D7; Architecture

```
src/
├── cli/                 # Command-line interface
│   ├── index.ts         # Entry point, flag parsing
│   ├── banner.ts        # ASCII art display
│   ├── help.ts          # Help text with examples
│   ├── setup.ts         # Interactive wizard
│   ├── select.ts        # Arrow-key selection component
│   └── cooking.ts       # Shimmer gradient animation
├── platforms/           # Platform-specific handlers
│   ├── types.ts         # PlatformHandler interface
│   ├── framer.ts        # Framer detection, mapping, stripping
│   ├── webflow.ts       # Webflow detection, mapping, stripping
│   ├── wix.ts           # Wix detection, mapping, stripping
│   ├── detect.ts        # Auto-detection by URL and HTML
│   └── index.ts         # Barrel exports
├── exporter/            # Export engine
│   ├── index.ts         # FramerExporter orchestrator
│   ├── capture.ts       # Puppeteer browser capture
│   ├── download.ts      # Parallel asset downloader
│   ├── output.ts        # HTML processing and file output
│   └── summary.ts       # Export report
├── assets/
│   └── asset-map.ts     # URL-to-local-path mapping
├── network/
│   ├── download.ts      # HTTP download with retries
│   └── pool.ts          # Concurrency pool
├── formatter/
│   └── prettify.ts      # Prettier-based JS formatter
├── logger/
│   └── index.ts         # Colored logging with cooking integration
├── server/
│   └── template.ts      # Embedded HTTP server template
├── config/
│   └── index.ts         # Global configuration
└── types.ts             # Shared TypeScript interfaces
```

## &#x1F527; How It Works

1. **SSR Fetch** - Raw HTTP GET of the page HTML (before JavaScript execution)
2. **Browser Capture** - Puppeteer loads the page, intercepts all network responses
3. **Hydration Wait** - Platform-specific wait for SPA rendering (Framer) or static render (Webflow/Wix)
4. **Lazy Load Scroll** - Full-page scroll triggers lazy-loaded images and videos
5. **Asset Download** - All intercepted resources downloaded with concurrency pool
6. **Badge Strip** - Platform-specific badges, ads, and tracking removed
7. **Integrity Strip** - SHA integrity hashes and CORS attributes removed for local serving
8. **URL Rewrite** - All CDN URLs in HTML, CSS, and JS rewritten to local paths
9. **Pretty-Print** - Minified JS files reformatted with Prettier for readability
10. **Output** - Clean `index.html` + `serve.cjs` written to output directory

## &#x1F91D; Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Run type-check: `npm run typecheck`
5. Format code: `npm run format`
6. Commit with conventional commits: `git commit -m "feat(platform): add Squarespace support"`
7. Push and open a PR

### Adding a New Platform

1. Create `src/platforms/yourplatform.ts` implementing `PlatformHandler`
2. Add it to `src/platforms/detect.ts` and `src/platforms/index.ts`
3. Test with a real site URL

### Commit Convention

```
feat(scope):     New feature
fix(scope):      Bug fix
perf(scope):     Performance improvement
refactor(scope): Code refactoring
chore(scope):    Tooling, deps, config
```

## &#x1F4DC; License

MIT License - see [LICENSE](LICENSE) for details.

## &#x1F4CB; Code of Conduct

### Our Pledge

We are committed to providing a friendly, safe, and welcoming environment for all, regardless of level of experience, gender identity, sexual orientation, disability, personal appearance, body size, race, ethnicity, age, religion, or nationality.

### Our Standards

**Positive behavior includes:**
- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community

**Unacceptable behavior includes:**
- Trolling, insulting, or derogatory comments
- Public or private harassment
- Publishing others' private information without permission
- Other conduct which could reasonably be considered inappropriate

### Enforcement

Project maintainers are responsible for clarifying standards of acceptable behavior and will take appropriate action in response to unacceptable behavior. Violations may be reported by opening an issue or contacting the maintainers.

---

<p align="center">
  Made with &#x2764; by <a href="https://github.com/danbenba">Dany</a>
</p>
