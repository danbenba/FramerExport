import type { Page } from 'puppeteer';
import { ui } from '../cli/theme.js';
export type AntiBotType = 'cloudflare' | 'captcha' | 'waf';
export class AntiBotError extends Error {
  readonly type: AntiBotType;
  readonly platform: string;
  readonly url: string;
  constructor(type: AntiBotType, platform: string, url: string, message?: string) {
    super(message || `Anti-bot protection detected (${type})`);
    this.name = 'AntiBotError';
    this.type = type;
    this.platform = platform;
    this.url = url;
  }
}
export function detectAntiBotHtml(html: string): AntiBotType | null {
  if (!html) return null;
  if (
    /<title>\s*Just a moment/i.test(html) ||
    /cf-browser-verification|cf-challenge-running|cf_chl_opt|challenge-platform/i.test(html) ||
    /Attention Required!\s*\|\s*Cloudflare/i.test(html) ||
    /Checking if the site connection is secure/i.test(html)
  ) {
    return 'cloudflare';
  }
  if (
    /class="g-recaptcha"|h-captcha|hcaptcha\.com|challenges\.cloudflare\.com\/turnstile/i.test(html)
  ) {
    const text: string = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length < 300) return 'captcha';
  }
  return null;
}
export async function detectAntiBotPage(page: Page): Promise<AntiBotType | null> {
  try {
    const title = await page.title();
    if (/just a moment/i.test(title) || /attention required/i.test(title)) {
      return 'cloudflare';
    }
    const flagged: string = await page.evaluate(() => {
      const body = document.body ? document.body.innerText || '' : '';
      const sparse = body.trim().length < 300;
      if (sparse && document.querySelector('iframe[src*="challenges.cloudflare.com"]')) {
        return 'cloudflare';
      }
      if (
        sparse &&
        document.querySelector(
          '.g-recaptcha, .h-captcha, iframe[src*="hcaptcha.com"], iframe[src*="recaptcha"]'
        )
      ) {
        return 'captcha';
      }
      const outer = document.documentElement.outerHTML || '';
      if (body.trim().length < 120 && /cf-chl|cloudflare|cf-browser-verification/i.test(outer)) {
        return 'cloudflare';
      }
      return '';
    });
    return (flagged as AntiBotType) || null;
  } catch {
    return null;
  }
}
export function formatAntiBotError(err: AntiBotError): string {
  const label =
    err.type === 'cloudflare'
      ? 'Cloudflare (browser challenge)'
      : err.type === 'captcha'
        ? 'a captcha challenge'
        : 'a WAF / bot filter';
  const lines: string[] = [
    '',
    `  ${ui.error('✗')} ${ui.error.bold('EXPORT BLOCKED')} — ${err.platform} is protected by ${label}.`,
    '',
    `  ${ui.muted('The headless browser could not pass the verification, so nothing was exported.')}`,
    '',
    `  ${ui.text.bold('  What you can try:')}`,
    `  ${ui.muted('   1.')} Retry in a few minutes — the challenge often expires.`,
    `  ${ui.muted('   2.')} Use an alternative, non-protected canonical URL if one exists.`,
    `  ${ui.muted('   3.')} Export from a network/IP the site trusts more.`,
    '',
    `  ${ui.muted('No files were written.')} ${ui.muted('(A stealth-browser mode is on the roadmap.)')}`,
    '',
  ];
  return lines.join('\n');
}
