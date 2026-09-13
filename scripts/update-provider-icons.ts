import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateRawSync } from 'node:zlib';
import puppeteer from 'puppeteer';
import prettier from 'prettier';

interface IconSource {
  id: string;
  name: string;
  description: string;
  homepage: string;
  color: string;
  displayColor: string;
  iconUrl: string;
  sourcePage: string;
  license: string;
  licenseUrl: string | null;
  guidelinesUrl: string | null;
  format: string;
  monochrome: boolean;
  viewport?: [number, number, number, number];
  archiveEntry?: string;
  archiveSha256?: string;
  sha256?: string;
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, 'assets', 'provider-icons');
const manifestPath = path.join(directory, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
  simpleIconsRevision: string;
  providers: IconSource[];
};
const download = process.argv.includes('--download');
await mkdir(directory, { recursive: true });

for (const source of manifest.providers) {
  const filename = path.join(directory, `${source.id}.${source.format}`);
  if (download) {
    const response = await fetch(source.iconUrl, {
      signal: AbortSignal.timeout(25_000),
      headers: { 'User-Agent': 'FramerExport icon catalogue maintenance' },
    });
    if (!response.ok) throw new Error(`${source.id}: HTTP ${response.status}`);
    let buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 1_000_000) throw new Error(`${source.id}: unexpected icon size`);
    if (source.archiveEntry) {
      buffer = readArchiveEntry(buffer, source.archiveEntry);
    }
    const hash = createHash('sha256').update(buffer).digest('hex');
    if (source.sha256 && hash !== source.sha256) {
      throw new Error(`${source.id}: source changed; review it before updating its SHA-256`);
    }
    await writeFile(filename, buffer);
    source.sha256 = hash;
  }
  const buffer = await readFile(filename);
  const hash = createHash('sha256').update(buffer).digest('hex');
  if (!source.sha256 || hash !== source.sha256)
    throw new Error(`${source.id}: source hash mismatch`);
}
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

const auto: IconSource = {
  id: 'auto',
  name: 'Auto-detect',
  description: 'Identify the provider from your URL.',
  homepage: '',
  color: '#FAB283',
  displayColor: '#FAB283',
  iconUrl: '',
  sourcePage: 'assets/provider-icons/auto.svg',
  license: 'MIT (Framer Export)',
  licenseUrl: null,
  guidelinesUrl: null,
  format: 'svg',
  monochrome: false,
};
const browser = await puppeteer.launch({ headless: true });
const catalogue: Record<string, unknown> = {};
try {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().startsWith('data:') || request.url() === 'about:blank')
      void request.continue();
    else void request.abort();
  });
  for (const source of [auto, ...manifest.providers]) {
    let buffer = await readFile(path.join(directory, `${source.id}.${source.format}`));
    const mime =
      source.format === 'svg'
        ? 'image/svg+xml'
        : source.format === 'ico'
          ? 'image/x-icon'
          : `image/${source.format}`;
    if (source.format === 'svg') {
      let svg = buffer.toString('utf8');
      if (/<(?:script|foreignObject)\b|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?!#|data:)/i.test(svg)) {
        throw new Error(`${source.id}: SVG contains active or external content`);
      }
      if (source.monochrome) svg = svg.replace('<svg ', `<svg fill="${source.displayColor}" `);
      if (source.viewport) {
        const [left, top, width, height] = source.viewport;
        if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0)
          throw new Error(`${source.id}: invalid SVG viewport`);
        svg = svg.replace(/<svg\b[^>]*>/, (opening) =>
          opening
            .replace(/\s(?:viewBox|width|height)\s*=\s*["'][^"']*["']/g, '')
            .replace(
              />$/,
              ` viewBox="${left} ${top} ${width} ${height}" width="${width}" height="${height}">`
            )
        );
      }
      buffer = Buffer.from(svg);
    }
    const dataUri = `data:${mime};base64,${buffer.toString('base64')}`;
    const raster = await page.evaluate(async (uri) => {
      const img = new Image();
      img.src = uri;
      await img.decode();
      if (img.naturalWidth < 1 || img.naturalHeight < 1) throw new Error('Empty icon');
      const rendered = [];
      for (const size of [256, 16]) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const context = canvas.getContext('2d')!;
        context.imageSmoothingQuality = 'high';
        const scale = size / Math.max(img.naturalWidth, img.naturalHeight);
        const width = img.naturalWidth * scale;
        const height = img.naturalHeight * scale;
        context.drawImage(img, (size - width) / 2, (size - height) / 2, width, height);
        rendered.push({
          png: canvas.toDataURL('image/png'),
          rgba: [...context.getImageData(0, 0, size, size).data],
        });
      }
      return { web: rendered[0].png, nativePixels: rendered[0].rgba, pixels: rendered[1].rgba };
    }, dataUri);
    if (!raster.pixels.some((value, index) => index % 4 === 3 && value > 0))
      throw new Error(`${source.id}: invisible icon`);
    catalogue[source.id] = {
      name: source.name,
      description: source.description,
      homepage: source.homepage,
      color: source.color,
      iconBackground: ['bubble', 'weebly', 'thinkific', 'elementor', 'podia'].includes(source.id)
        ? '#EEEEEE'
        : 'transparent',
      iconDataUri: raster.web,
      iconRgba: {
        width: 256,
        height: 256,
        deflateBase64: deflateSync(Buffer.from(raster.nativePixels)).toString('base64'),
      },
      iconPixels: {
        width: 16,
        height: 16,
        rgbaBase64: Buffer.from(raster.pixels).toString('base64'),
      },
      sourceUrl: source.iconUrl || source.sourcePage,
      licenseUrl: source.licenseUrl,
    };
    console.log(`${source.id}: ${buffer.length} bytes -> 256px PNG / compressed RGBA`);
  }
} finally {
  await browser.close();
}
const generated = `import type { ProviderId, ProviderPresentation } from './presentation.js';\n\nexport const PROVIDER_ICONS: Readonly<Record<ProviderId, ProviderPresentation>> = ${JSON.stringify(catalogue, null, 2)};\n`;
await writeFile(
  path.join(root, 'src', 'platforms', 'provider-icons.generated.ts'),
  await prettier.format(generated, { parser: 'typescript', singleQuote: true, printWidth: 100 })
);
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
const rows = manifest.providers.map(
  (source) =>
    `| ${source.name} | [Original icon](${source.iconUrl}) · [Brand source](${source.sourcePage})${source.archiveEntry ? ` · Archive entry: ${source.archiveEntry}` : ''}${source.viewport ? ` · Mark viewport: ${source.viewport.join(', ')}` : ''} | ${source.licenseUrl ? `[${source.license}](${source.licenseUrl})` : source.license} |${source.guidelinesUrl ? ` [Guidelines](${source.guidelinesUrl}) |` : ' — |'}`
);

function readArchiveEntry(archive: Buffer, filename: string): Buffer {
  let end = archive.length - 22;
  while (end >= Math.max(0, archive.length - 65557) && archive.readUInt32LE(end) !== 0x06054b50)
    end--;
  if (end < 0 || archive.readUInt32LE(end) !== 0x06054b50) throw new Error('Invalid icon archive');
  let offset = archive.readUInt32LE(end + 16);
  const count = archive.readUInt16LE(end + 10);
  for (let index = 0; index < count; index++) {
    if (archive.readUInt32LE(offset) !== 0x02014b50)
      throw new Error('Invalid icon archive directory');
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const name = archive.toString('utf8', offset + 46, offset + 46 + nameLength);
    if (name === filename) {
      const method = archive.readUInt16LE(offset + 10);
      const length = archive.readUInt32LE(offset + 20);
      const local = archive.readUInt32LE(offset + 42);
      if (archive.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid icon archive entry');
      const start =
        local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28);
      if (start + length > archive.length) throw new Error('Truncated icon archive entry');
      const compressed = archive.subarray(start, start + length);
      if (method === 0) return compressed;
      if (method === 8) return inflateRawSync(compressed, { maxOutputLength: 1_000_000 });
      throw new Error('Unsupported icon archive compression');
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`Missing icon archive entry: ${filename}`);
}
await writeFile(
  path.join(directory, 'SOURCES.md'),
  `# Provider icon sources\n\nThe 25 provider icons are bundled for offline identification in the terminal and web interface. Brand names and marks belong to their respective owners. Inclusion does not imply endorsement. Simple Icons artwork uses its published collection license; that does not grant rights to the brands. Official favicons have no separate redistribution license stated by their source pages. The auto-detect icon is original project artwork under MIT.\n\nSources were retrieved on 2026-09-13. Simple Icons is pinned to revision \`${manifest.simpleIconsRevision}\`. Original bytes and SHA-256 hashes are checked in alongside this file. For dark backgrounds, black Simple Icons marks are rendered in #EEEEEE; all shapes are preserved. Other Simple Icons marks use their catalogue brand color. Official favicon colors are preserved. Raster outputs are 256 × 256 PNG for the web and native terminal protocols, with compressed RGBA for SIXEL. Vector originals retain their geometry at high display densities; raster originals retain the detail available in their source. Terminal images scale to the available cells and measured pixel dimensions.\n\n| Provider | Sources | License information | Brand guidelines |\n| --- | --- | --- | --- |\n${rows.join('\n')}\n\n## Regeneration\n\n\`node --import tsx scripts/update-provider-icons.ts\` rebuilds the TypeScript catalogue from local originals using the installed Puppeteer Chromium. The renderer blocks network requests. \`--download\` first fetches the recorded icon URLs and rejects changed hashes; update a URL/hash only after reviewing the new source. Chromium rasterization can vary with browser versions, so check the generated diff after upgrading Puppeteer. The normal application and package build never download icons.\n\n## Terminal capabilities\n\nNative terminal images use the real provider artwork: [Kitty graphics protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/) and [iTerm2 inline images](https://iterm2.com/documentation-images.html) require supporting terminal emulators. SIXEL support is enabled only after a device-attributes reply advertises feature 4 and the terminal reports its cell size. [Windows Terminal introduced SIXEL in 1.22](https://devblogs.microsoft.com/commandline/windows-terminal-preview-1-22-release/). Unsupported terminals and multiplexers use crisp ASCII monograms with the provider names. Set FEXPORT_TERMINAL_IMAGES=0 to disable native images. Graphics are cleared on modal changes, resize and exit.\n`
);
