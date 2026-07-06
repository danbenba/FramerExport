/**
 * Offline detection smoke test for the v5 platform registry.
 *
 *   npx tsx scripts/check-detection.ts
 *
 * Verifies, without any network:
 *  - the registry is internally consistent (unique names, valid categories,
 *    frozen trio outranks every new platform);
 *  - each platform detects on its own hosting domain;
 *  - generator-based platforms detect from a synthetic <meta generator>;
 *  - the frozen trio (framer/webflow/wix) still detects exactly as in v4.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PLATFORM_REGISTRY,
  CATEGORY_ORDER,
  detectByUrl,
  detectByGenerator,
} from '../src/platforms/index.js';
import type { PlatformType } from '../src/platforms/types.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESEARCH = path.join(ROOT, 'tests', 'research');

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// ── 1. registry consistency ──────────────────────────────────────────────────
check('registry size >= 25', PLATFORM_REGISTRY.length >= 25, `got ${PLATFORM_REGISTRY.length}`);

const names = PLATFORM_REGISTRY.map((p) => p.name);
check('unique names', new Set(names).size === names.length);

for (const p of PLATFORM_REGISTRY) {
  check(`${p.name}: valid category`, CATEGORY_ORDER.includes(p.category), p.category);
  check(`${p.name}: priority 0-100`, p.priority >= 0 && p.priority <= 100, String(p.priority));
}

const trio = ['framer', 'webflow', 'wix'];
const maxNewPriority = Math.max(
  ...PLATFORM_REGISTRY.filter((p) => !trio.includes(p.name)).map((p) => p.priority)
);
for (const t of trio) {
  const handler = PLATFORM_REGISTRY.find((p) => p.name === t)!;
  check(`frozen ${t} outranks all new platforms`, handler.priority > maxNewPriority,
    `${t}=${handler.priority} vs newMax=${maxNewPriority}`);
}

// ── 2. frozen trio detection is unchanged from v4 ─────────────────────────────
const frozenCases: Array<[string, PlatformType]> = [
  ['https://acme.framer.app', 'framer'],
  ['https://acme.framer.website', 'framer'],
  ['https://acme.webflow.io', 'webflow'],
  ['https://my-site.wixsite.com/home', 'wix'],
];
for (const [url, expected] of frozenCases) {
  const got = detectByUrl(url)?.name ?? 'null';
  check(`frozen detect ${url}`, got === expected, `expected ${expected}, got ${got}`);
}

// ── 3. per-platform detection from research profiles ──────────────────────────
const profileFiles = fs
  .readdirSync(RESEARCH)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'));

for (const file of profileFiles) {
  const profile = JSON.parse(fs.readFileSync(path.join(RESEARCH, file), 'utf8'));
  const name: string = profile.platform;
  const hosting: string[] = profile.hostingDomains || [];

  for (const d of hosting) {
    if (!d || typeof d !== 'string') continue;
    // Synthesize a realistic customer URL: a subdomain of the registrable domain,
    // so apex entries like "notion.site" become "demo.notion.site".
    const bare = d.replace(/^https?:\/\//, '').replace(/^\.+/, '');
    const url = `https://demo.${bare}/`;
    const got = detectByUrl(url);
    // Only assert when the profile advertises a URL regex (custom-domain-only
    // platforms like WordPress/Elementor legitimately have none).
    if (profile.detectUrlRegex) {
      check(`${name}: detect ${url}`, got?.name === name, `got ${got?.name ?? 'null'}`);
    }
  }

  if (profile.metaGenerator) {
    const html = `<meta name="generator" content="${profile.metaGenerator}">`;
    const got = detectByGenerator(html);
    check(`${name}: detect by generator`, got?.name === name, `got ${got?.name ?? 'null'}`);
  }
}

// ── report ────────────────────────────────────────────────────────────────────
console.log(`\nDetection check: ${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log('\n' + failures.join('\n'));
  process.exit(1);
}
console.log('All detection assertions passed.');
