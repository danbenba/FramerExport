import { select, type SelectOption } from './select.js';
import {
  platformsByCategory,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  detectByUrl,
} from '../platforms/index.js';
import type { PlatformType } from '../platforms/types.js';

export const AUTO_DETECT = '__auto__';

export type ToolSelection = { platform: PlatformType } | { auto: true };

export async function selectTool(): Promise<ToolSelection> {
  const grouped = platformsByCategory();
  const options: SelectOption[] = [{ label: 'Auto-detect from URL', value: AUTO_DETECT }];

  for (const cat of CATEGORY_ORDER) {
    options.push({ label: CATEGORY_LABELS[cat], value: `__heading_${cat}`, heading: true });
    for (const handler of grouped[cat]) {
      options.push({ label: handler.displayName, value: handler.name });
    }
  }

  const choice = await select('Select a tool to export', options, 0, {
    headerLines: ['25+ platforms supported, scroll to browse them all.'],
    footer: '↑↓ scroll   enter select   mouse click   esc close',
  });

  if (choice === AUTO_DETECT) return { auto: true };
  return { platform: choice as PlatformType };
}

export function resolveDetected(siteUrl: string): PlatformType | null {
  const detected = detectByUrl(siteUrl);
  return detected ? detected.name : null;
}
