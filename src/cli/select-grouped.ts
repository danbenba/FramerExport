import chalk from 'chalk';
import { select, type SelectOption } from './select.js';
import {
  platformsByCategory,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  detectByUrl,
} from '../platforms/index.js';
import type { PlatformType, PlatformCategory } from '../platforms/types.js';

export type PlatformSelection = { platform: PlatformType } | { modifyUrl: true };

const MODIFY_URL = '__modify_url__';
const BROWSE = '__browse__';
const USE_DETECTED = '__use_detected__';
const BACK = '__back__';

/**
 * Registry-driven platform picker. Two steps (category → platform) so the
 * list never overflows the terminal, with the auto-detected platform surfaced
 * up front. Returns either a chosen platform or a request to edit the URL.
 */
export async function selectPlatform(siteUrl: string): Promise<PlatformSelection> {
  const grouped = platformsByCategory();
  const detected = detectByUrl(siteUrl); // null when detection is not confident

  // ── Step 0: offer the detected platform directly ──────────────────────────
  if (detected) {
    const choice = await select(
      'Platform detected',
      [
        { label: `Use ${detected.displayName}`, value: USE_DETECTED },
        { label: 'Browse all platforms', value: BROWSE },
      ],
      0,
      {
        headerLines: [`URL: ${siteUrl}`, `Detected: ${detected.displayName}`],
        actions: [{ label: 'Modify URL', value: MODIFY_URL }],
        footer: 'tab focus button  ·  enter select  ·  mouse hover/click',
      }
    );
    if (choice === MODIFY_URL) return { modifyUrl: true };
    if (choice === USE_DETECTED) return { platform: detected.name };
    // else fall through to browse
  }

  // ── Step 1 + 2: category → platform (with back navigation) ────────────────
  let categoryDefault = detected
    ? Math.max(0, CATEGORY_ORDER.indexOf(detected.category))
    : 0;

  while (true) {
    const categoryOptions: SelectOption[] = CATEGORY_ORDER.map((cat) => ({
      label: `${CATEGORY_LABELS[cat]} ${chalk.gray(`(${grouped[cat].length})`)}`,
      value: cat,
    }));

    const category = await select('Select a category', categoryOptions, categoryDefault, {
      headerLines: [`URL: ${siteUrl}`],
      actions: [{ label: 'Modify URL', value: MODIFY_URL }],
      footer: 'tab focus button  ·  enter next  ·  mouse hover/click',
    });

    if (category === MODIFY_URL) return { modifyUrl: true };

    const cat = category as PlatformCategory;
    categoryDefault = CATEGORY_ORDER.indexOf(cat);
    const handlers = grouped[cat];

    const platformOptions: SelectOption[] = handlers.map((handler) => ({
      label:
        detected && handler.name === detected.name
          ? `${handler.displayName}${chalk.gray(' (detected)')}`
          : handler.displayName,
      value: handler.name,
    }));

    const platformDefault =
      detected && detected.category === cat
        ? Math.max(0, handlers.findIndex((handler) => handler.name === detected.name))
        : 0;

    const platform = await select('Select platform', platformOptions, platformDefault, {
      headerLines: [`Category: ${CATEGORY_LABELS[cat]}`],
      actions: [{ label: 'Back to categories', value: BACK }],
      footer: 'tab focus button  ·  enter select  ·  mouse hover/click',
    });

    if (platform === BACK) continue;
    return { platform: platform as PlatformType };
  }
}
