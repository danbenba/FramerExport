import { stdin, stdout } from 'node:process';
import path from 'node:path';
import pkg from '../../package.json';
import { RawInput, type InputEvent } from './input.js';
import {
  TerminalCanvas,
  fitText,
  textWidth,
  wrapText,
  plainText,
  paintTerminal,
} from './terminal-screen.js';
import { THEME } from './theme.js';
import { BRAND_ART, BRAND_COLOR, BRAND_SPLIT } from './banner.js';
import { terminalPixelBlast } from './backdrop.js';
import {
  TerminalIconRenderer,
  detectTerminalImageSupport,
  providerMonogram,
  type TerminalIconPlacement,
} from './terminal-icons.js';
import { PLATFORM_REGISTRY, detectPlatform, isBetaPlatform } from '../platforms/index.js';
import { providerPresentation, type ProviderId } from '../platforms/presentation.js';
import type { Preferences, ExportDraft } from './preferences.js';

export const WIZARD_STEPS = ['Select provider', 'Site details', 'Options', 'Review'];
const SHORT_STEPS = ['Provider', 'Site', 'Options', 'Review'];
const PROVIDERS: ProviderId[] = [
  'auto',
  ...PLATFORM_REGISTRY.map((item) => item.name as ProviderId),
];
const INPUT_GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
function previousBoundary(value: string, cursor: number): number {
  return (
    [...INPUT_GRAPHEMES.segment(value)]
      .map((item) => item.index)
      .filter((index) => index < cursor)
      .at(-1) ?? 0
  );
}
function nextBoundary(value: string, cursor: number): number {
  return (
    [...INPUT_GRAPHEMES.segment(value)].map((item) => item.index).find((index) => index > cursor) ??
    value.length
  );
}
function inputDisplay(value: string, cursor: number, width: number): string {
  let before = value.slice(0, cursor);
  while (before && textWidth(before) + 1 > width)
    before = before.slice([...INPUT_GRAPHEMES.segment(before)][0].segment.length);
  return fitText(before + '▏' + value.slice(cursor), width, false);
}
type Screen = 'onboarding' | 'wizard' | 'settings' | 'help' | 'opening-ui' | 'reset';
type OverlayState = { screen: Screen; focus: string; scroll: number; error: string };
const TOOLTIPS: Record<string, string> = {
  help: 'Help · Keyboard shortcuts and mouse controls',
  settings: 'Settings · Defaults, appearance and updates',
  'open-ui': 'Open the browser interface alongside this terminal',
  'overlay:back': 'Close this dialog and return to your work',
  'settings:reset': 'Reset preferences and the saved draft',
  'view:cards': 'Show providers as cards',
  'view:list': 'Show providers in a scrollable list',
  'page:previous': 'Show the previous providers',
  'page:next': 'Show the next providers',
};
export interface HitRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  body?: boolean;
  disabled?: boolean;
}
export interface WizardLayout {
  canvas: TerminalCanvas;
  regions: HitRegion[];
  bodyTop: number;
  bodyHeight: number;
  contentHeight: number;
  pageSize: number;
  pageCount: number;
  gridColumns: number;
  providers: ProviderId[];
  icons: TerminalIconPlacement[];
}
export interface WizardOptions {
  preferences: Preferences;
  draft?: ExportDraft | null;
  settingsOnly?: boolean;
  savePreferences?: (patch: Partial<Preferences>) => Preferences;
  saveDraft?: (draft: ExportDraft) => void;
  openUi?: () => Promise<string>;
  uiAddress?: string;
  resetPreferences?: () => Preferences;
}

export function validSiteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}
function suggestedDirectory(url: string, provider: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').replace(/[^a-z0-9-]+/gi, '-');
    const name = provider === 'auto' ? detectPlatform(url).name : provider;
    return './' + (name === 'unknown' ? 'site' : name) + '-' + host;
  } catch {
    return './export';
  }
}

export class WizardModel {
  preferences: Preferences;
  draft: ExportDraft;
  screen: Screen;
  focus = '';
  query = '';
  page = 0;
  scroll = 0;
  error = '';
  notice = '';
  uiAddress = '';
  finished = false;
  cancelled = false;
  selectAll = false;
  cursor = 0;
  hover = '';
  uiOpening = false;
  animationTime = 0;
  nativeIcons = false;
  private ripples: Array<{ x: number; y: number; time: number }> = [];
  private visited = 0;
  private lastLayout?: WizardLayout;
  private dragging = false;
  private revealFocus = true;
  private pageAnchor?: ProviderId;
  private overlays: OverlayState[] = [];
  private contentSize = '';
  private uiGeneration = 0;
  private galleryInitialized = false;

  constructor(readonly options: WizardOptions) {
    this.preferences = { ...options.preferences };
    this.draft = options.draft
      ? { ...options.draft }
      : {
          schemaVersion: 1,
          provider: this.preferences.defaultProvider,
          siteUrl: '',
          outDir: '',
          prettyPrint: this.preferences.prettyPrint,
          includeSubpages: this.preferences.includeSubpages,
          concurrency: this.preferences.concurrency,
          step: 0,
        };
    if (this.draft.provider === 'unknown') this.draft.provider = 'auto';
    this.draft.step = Math.max(0, Math.min(3, this.draft.step));
    if (this.draft.step > 1 && !validSiteUrl(this.draft.siteUrl)) this.draft.step = 1;
    this.visited = this.draft.step;
    this.screen = options.settingsOnly
      ? 'settings'
      : this.preferences.onboardingCompleted
        ? 'wizard'
        : 'onboarding';
    this.uiAddress = options.uiAddress || '';
    this.focus =
      this.screen === 'onboarding'
        ? 'welcome:continue'
        : this.screen === 'settings'
          ? 'setting:defaultProvider'
          : this.defaultFocus();
    this.cursor = this.fieldValue().length;
    if (options.draft) this.notice = 'Draft restored';
    if (options.settingsOnly)
      this.overlays.push({ screen: 'wizard', focus: this.defaultFocus(), scroll: 0, error: '' });
  }

  private get modal(): boolean {
    return !['wizard', 'onboarding'].includes(this.screen);
  }
  private openOverlay(screen: Screen): void {
    if (this.screen === screen) return;
    this.overlays.push({
      screen: this.screen,
      focus: this.focus,
      scroll: this.scroll,
      error: this.error,
    });
    this.screen = screen;
    this.focus = screen === 'settings' ? 'setting:defaultProvider' : 'overlay:back';
    this.scroll = 0;
    this.hover = '';
    this.error = '';
  }
  private closeOverlay(): void {
    const previous = this.overlays.pop();
    if (this.options.settingsOnly && !this.overlays.length) {
      this.cancelled = true;
      return;
    }
    this.screen = previous?.screen || 'wizard';
    this.focus = previous?.focus || this.defaultFocus();
    this.scroll = previous?.scroll || 0;
    this.error = previous?.error || '';
    this.hover = '';
  }

  private defaultFocus(): string {
    return ['provider:' + this.draft.provider, 'field:siteUrl', 'option:prettyPrint', 'next'][
      this.draft.step
    ];
  }
  private persist(): void {
    try {
      this.options.saveDraft?.({ ...this.draft });
    } catch (error) {
      this.notice = 'Draft could not be saved: ' + (error as Error).message;
    }
  }
  private setPreference(patch: Partial<Preferences>): void {
    try {
      this.preferences = this.options.savePreferences?.(patch) || { ...this.preferences, ...patch };
      this.notice = 'Preferences saved';
      if (patch.launchUi === false) {
        this.uiGeneration++;
        this.uiOpening = false;
        this.uiAddress = '';
        this.notice = 'UI closed';
      } else if (patch.launchUi === true && this.options.openUi) this.startUi();
    } catch (error) {
      this.error = (error as Error).message;
    }
  }
  private moveStep(step: number): void {
    this.persist();
    this.draft.step = step;
    this.visited = Math.max(this.visited, step);
    this.scroll = 0;
    this.error = '';
    this.focus = this.defaultFocus();
    this.cursor = this.fieldValue().length;
    this.selectAll = false;
    this.persist();
  }
  activate(id: string): void {
    this.revealFocus = true;
    this.selectAll = false;
    if (id.startsWith('field:')) {
      this.focus = id;
      this.cursor = this.fieldValue().length;
      return;
    }
    if (id.startsWith('provider:')) {
      this.draft.provider = id.slice(9) as ProviderId;
      this.focus = id;
      this.error = '';
      this.persist();
      return;
    }
    if (id.startsWith('step:')) {
      const step = Number(id.slice(5));
      if (step <= this.visited && (step < 2 || validSiteUrl(this.draft.siteUrl)))
        this.moveStep(step);
      return;
    }
    if (id === 'next') {
      if (this.draft.step === 1) {
        if (!validSiteUrl(this.draft.siteUrl)) {
          this.error = 'Enter an http:// or https:// URL without credentials.';
          this.focus = 'field:siteUrl';
          return;
        }
        if (!this.draft.outDir.trim())
          this.draft.outDir = suggestedDirectory(this.draft.siteUrl, this.draft.provider);
      }
      if (this.draft.step === 3) {
        this.persist();
        this.finished = true;
      } else this.moveStep(this.draft.step + 1);
      return;
    }
    if (id === 'back') {
      if (this.draft.step > 0) this.moveStep(this.draft.step - 1);
      else this.activate('cancel');
      return;
    }
    if (id === 'cancel') {
      this.persist();
      this.cancelled = true;
      return;
    }
    if (id === 'welcome:continue' || id === 'welcome:skip') {
      this.setPreference({ onboardingCompleted: true });
      this.screen = 'wizard';
      this.focus = this.defaultFocus();
      this.scroll = 0;
      return;
    }
    if (id === 'settings' || id === 'help') {
      this.openOverlay(id);
      return;
    }
    if (id === 'overlay:back') {
      this.closeOverlay();
      return;
    }
    if (id === 'settings:reset') {
      this.openOverlay('reset');
      return;
    }
    if (id === 'reset:confirm' && this.screen === 'reset') {
      try {
        if (!this.options.resetPreferences)
          throw new Error('Reset is unavailable in this session.');
        const preferences = this.options.resetPreferences();
        const fresh = new WizardModel({ preferences });
        this.preferences = fresh.preferences;
        this.draft = fresh.draft;
        this.screen = fresh.screen;
        this.focus = fresh.focus;
        this.overlays = [];
        this.visited = 0;
        this.query = '';
        this.page = 0;
        this.scroll = 0;
        this.error = '';
        this.uiAddress = '';
        this.uiOpening = false;
        this.uiGeneration++;
        this.notice = 'Preferences and draft reset';
      } catch (error) {
        this.error = (error as Error).message;
      }
      return;
    }
    if (id === 'view:cards' || id === 'view:list') {
      this.pageAnchor = this.draft.provider as ProviderId;
      this.setPreference({ viewMode: id.slice(5) as Preferences['viewMode'] });
      this.page = 0;
      this.scroll = 0;
      return;
    }
    if (id === 'page:previous' || id === 'page:next') {
      this.page = Math.max(
        0,
        Math.min((this.lastLayout?.pageCount || 1) - 1, this.page + (id === 'page:next' ? 1 : -1))
      );
      this.scroll = 0;
      this.focus = 'field:query';
      return;
    }
    if (id.startsWith('option:')) {
      const key = id.slice(7);
      if (key === 'concurrency')
        this.draft.concurrency = this.nextConcurrency(this.draft.concurrency);
      else if (key === 'prettyPrint' || key === 'includeSubpages')
        this.draft[key] = !this.draft[key];
      this.persist();
      return;
    }
    if (id.startsWith('setting:')) {
      const key = id.slice(8) as keyof Preferences;
      if (key === 'defaultProvider')
        this.setPreference({
          defaultProvider:
            PROVIDERS[
              (PROVIDERS.indexOf(this.preferences.defaultProvider as ProviderId) + 1) %
                PROVIDERS.length
            ],
        });
      else if (key === 'viewMode')
        this.setPreference({ viewMode: this.preferences.viewMode === 'cards' ? 'list' : 'cards' });
      else if (key === 'concurrency')
        this.setPreference({ concurrency: this.nextConcurrency(this.preferences.concurrency) });
      else if (typeof this.preferences[key] === 'boolean')
        this.setPreference({ [key]: !this.preferences[key] });
      return;
    }
    if (id === 'open-ui') {
      this.openOverlay('opening-ui');
      this.startUi();
    }
  }
  private startUi(): void {
    if (this.uiOpening) return;
    this.uiOpening = true;
    const generation = ++this.uiGeneration;
    this.notice = 'Opening UI';
    void this.options
      .openUi?.()
      .then((address) => {
        if (generation !== this.uiGeneration) return;
        this.uiAddress = address;
        this.notice = 'UI Open';
      })
      .catch((error) => {
        if (generation !== this.uiGeneration) return;
        this.error = error.message;
      })
      .finally(() => {
        if (generation !== this.uiGeneration) return;
        this.uiOpening = false;
      });
    if (!this.options.openUi) {
      this.uiOpening = false;
      this.error = 'The browser interface is unavailable in this session.';
    }
  }
  private nextConcurrency(value: number): number {
    return [6, 12, 20, 32].find((item) => item > value) || 6;
  }
  private fieldValue(): string {
    return this.focus === 'field:query'
      ? this.query
      : this.focus === 'field:siteUrl'
        ? this.draft.siteUrl
        : this.focus === 'field:outDir'
          ? this.draft.outDir
          : '';
  }
  private writeField(value: string): void {
    const limit = this.focus === 'field:query' ? 80 : 4096;
    let clean = '';
    for (const { segment } of INPUT_GRAPHEMES.segment(plainText(value))) {
      if (clean.length + segment.length > limit) break;
      clean += segment;
    }
    value = clean;
    if (this.focus === 'field:query') {
      this.query = value;
      this.page = 0;
      this.scroll = 0;
    } else if (this.focus === 'field:siteUrl') this.draft.siteUrl = value;
    else if (this.focus === 'field:outDir') this.draft.outDir = value;
    this.error = '';
  }
  private textInput(value: string): void {
    if (!this.focus.startsWith('field:')) {
      if (this.screen !== 'wizard' || this.draft.step !== 0) return;
      this.focus = 'field:query';
      this.cursor = this.query.length;
    }
    const current = this.selectAll ? '' : this.fieldValue();
    if (this.selectAll) this.cursor = 0;
    value = plainText(value.replace(/[\r\n\t]/g, ''));
    this.writeField(current.slice(0, this.cursor) + value + current.slice(this.cursor));
    this.cursor = Math.min(this.fieldValue().length, this.cursor + value.length);
    this.selectAll = false;
  }
  handle(event: InputEvent): void {
    const layout = this.lastLayout;
    if (!layout) return;
    if (event.type !== 'mouse') {
      this.revealFocus = true;
      this.hover = '';
    }
    if (event.type === 'mouse') {
      if (event.kind === 'wheel-up' || event.kind === 'wheel-down') {
        this.revealFocus = false;
        const direction = event.kind === 'wheel-down' ? 1 : -1;
        const maximum = Math.max(0, layout.contentHeight - layout.bodyHeight);
        if (maximum) this.scroll = Math.max(0, Math.min(maximum, this.scroll + direction * 2));
        else if (this.screen === 'wizard' && this.draft.step === 0)
          this.activate(direction > 0 ? 'page:next' : 'page:previous');
        return;
      }
      const x = event.x - 1,
        y = event.y - 1;
      const region = [...layout.regions]
        .reverse()
        .find(
          (item) =>
            (!item.body || (y >= layout.bodyTop && y < layout.bodyTop + layout.bodyHeight)) &&
            x >= item.x &&
            x < item.x + item.width &&
            y >= item.y &&
            y < item.y + item.height
        );
      if (this.dragging && (event.kind === 'move' || event.kind === 'click')) {
        this.revealFocus = false;
        this.scroll = Math.round(
          Math.max(0, Math.min(1, (y - layout.bodyTop) / Math.max(1, layout.bodyHeight - 1))) *
            Math.max(0, layout.contentHeight - layout.bodyHeight)
        );
        if (event.kind === 'click') this.dragging = false;
        return;
      }
      if (event.kind === 'move') {
        this.hover = region?.id || '';
        return;
      }
      if (region?.id === 'scrollbar' && (event.kind === 'press' || event.kind === 'click')) {
        this.revealFocus = false;
        this.dragging = event.kind === 'press';
        this.scroll = Math.round(
          ((y - layout.bodyTop) / Math.max(1, layout.bodyHeight - 1)) *
            Math.max(0, layout.contentHeight - layout.bodyHeight)
        );
        return;
      }
      if (event.kind === 'click' && region && !region.disabled) {
        if (!this.preferences.reduceMotion) {
          this.ripples.push({ x, y, time: this.animationTime });
          this.ripples = this.ripples.slice(-10);
        }
        if (!['settings', 'help', 'open-ui', 'settings:reset'].includes(region.id))
          this.focus = region.id;
        this.activate(region.id);
      }
      return;
    }
    if (event.type === 'paste') {
      this.textInput(event.text);
      return;
    }
    if (event.type === 'char') {
      if (!this.focus.startsWith('field:')) {
        if (event.char === '?') {
          this.activate('help');
          return;
        }
        if (event.char === ',') {
          this.activate('settings');
          return;
        }
        if (event.char === ' ' && /^(option|setting):/.test(this.focus)) {
          this.activate(this.focus);
          return;
        }
      }
      this.textInput(event.char);
      return;
    }
    const key = event.name;
    if (key === 'ctrl-c') {
      this.activate('cancel');
      return;
    }
    if (key === 'escape' || key === 'alt-left') {
      if (this.modal) this.activate('overlay:back');
      else if (this.screen === 'onboarding') this.activate('welcome:skip');
      else if (this.query && this.draft.step === 0) {
        this.query = '';
        this.page = 0;
      } else this.activate('back');
      return;
    }
    if (key === 'ctrl-l') return;
    if (key === 'tab' || key === 'shift-tab') {
      this.cycleFocus(key === 'tab' ? 1 : -1);
      return;
    }
    if (key === 'page-up' || key === 'page-down') {
      if (this.screen === 'wizard' && this.draft.step === 0)
        this.activate(key === 'page-down' ? 'page:next' : 'page:previous');
      else {
        this.revealFocus = false;
        this.scroll = Math.max(
          0,
          Math.min(
            layout.contentHeight - layout.bodyHeight,
            this.scroll + (key === 'page-down' ? 1 : -1) * layout.bodyHeight
          )
        );
      }
      return;
    }
    if (key === 'return') {
      if (this.focus === 'field:query') {
        const provider = layout.providers[this.page * layout.pageSize];
        if (provider) {
          this.activate('provider:' + provider);
          this.activate('next');
        }
      } else if (this.focus === 'field:siteUrl') {
        if (!validSiteUrl(this.draft.siteUrl)) this.activate('next');
        else {
          this.focus = 'field:outDir';
          this.cursor = this.draft.outDir.length;
        }
      } else if (this.focus === 'field:outDir') this.activate('next');
      else if (this.focus.startsWith('provider:')) {
        this.activate(this.focus);
        this.activate('next');
      } else this.activate(this.focus);
      return;
    }
    if (this.focus.startsWith('field:')) {
      const value = this.fieldValue();
      if (key === 'ctrl-a') {
        this.selectAll = true;
        return;
      }
      if (key === 'ctrl-u') {
        this.writeField('');
        this.cursor = 0;
        return;
      }
      if (key === 'home') {
        this.cursor = 0;
        this.selectAll = false;
        return;
      }
      if (key === 'end') {
        this.cursor = value.length;
        this.selectAll = false;
        return;
      }
      if (key === 'left' || key === 'right') {
        this.cursor =
          key === 'left' ? previousBoundary(value, this.cursor) : nextBoundary(value, this.cursor);
        this.selectAll = false;
        return;
      }
      if (key === 'backspace' || key === 'delete') {
        if (this.selectAll) {
          this.writeField('');
          this.cursor = 0;
        } else if (key === 'backspace' && this.cursor) {
          const previous = previousBoundary(value, this.cursor);
          this.writeField(value.slice(0, previous) + value.slice(this.cursor));
          this.cursor = previous;
        } else if (key === 'delete')
          this.writeField(
            value.slice(0, this.cursor) + value.slice(nextBoundary(value, this.cursor))
          );
        this.selectAll = false;
        return;
      }
    }
    if (['up', 'down', 'left', 'right', 'home', 'end'].includes(key)) {
      if (
        this.screen === 'wizard' &&
        this.draft.step === 0 &&
        (this.focus.startsWith('provider:') || this.focus === 'field:query')
      ) {
        let current = layout.providers.indexOf(this.focus.slice(9) as ProviderId);
        if (current < 0)
          current = this.page * layout.pageSize - (key === 'down' ? layout.gridColumns : 1);
        const delta =
          key === 'down'
            ? layout.gridColumns
            : key === 'up'
              ? -layout.gridColumns
              : key === 'right'
                ? 1
                : -1;
        const index =
          key === 'home'
            ? 0
            : key === 'end'
              ? layout.providers.length - 1
              : Math.max(0, Math.min(layout.providers.length - 1, current + delta));
        if (layout.providers[index]) {
          this.page = Math.floor(index / layout.pageSize);
          this.focus = 'provider:' + layout.providers[index];
          this.scroll = 0;
        }
      } else this.cycleFocus(key === 'up' || key === 'left' ? -1 : 1);
    }
  }
  private cycleFocus(direction: number): void {
    const regions =
      this.lastLayout?.regions.filter((item) => !item.disabled && item.id !== 'scrollbar') || [];
    const ids = [...new Set(regions.map((item) => item.id))];
    const index = ids.indexOf(this.focus);
    this.focus = ids[(index + direction + ids.length) % ids.length] || '';
    this.cursor = this.fieldValue().length;
    this.selectAll = false;
    const region = regions.find((item) => item.id === this.focus);
    if (region?.body && this.lastLayout) {
      if (region.y < this.lastLayout.bodyTop) this.scroll += region.y - this.lastLayout.bodyTop;
      else if (region.y + region.height > this.lastLayout.bodyTop + this.lastLayout.bodyHeight)
        this.scroll +=
          region.y + region.height - this.lastLayout.bodyTop - this.lastLayout.bodyHeight;
    }
  }

  render(columns: number, rows: number): WizardLayout {
    if (!this.modal) return this.renderContent(columns, rows);
    columns = Math.max(1, Math.floor(columns));
    rows = Math.max(1, Math.floor(rows));
    const underlying = this.overlays[0];
    const background = new WizardModel({ preferences: this.preferences, draft: this.draft });
    background.screen = underlying?.screen === 'onboarding' ? 'onboarding' : 'wizard';
    background.focus = underlying?.focus || this.defaultFocus();
    background.scroll = underlying?.scroll || 0;
    background.query = this.query;
    background.page = this.page;
    background.galleryInitialized = true;
    background.visited = this.visited;
    background.animationTime = this.animationTime;
    const backdrop = background.renderContent(columns, rows).canvas;
    const inset = columns >= 36 && rows >= 12 ? 2 : 0;
    const dialogWidth = Math.max(1, Math.min(78, columns - inset * 2));
    const dialogHeight = Math.max(
      1,
      Math.min(this.screen === 'settings' ? 36 : this.screen === 'help' ? 28 : 14, rows - inset * 2)
    );
    const x = Math.floor((columns - dialogWidth) / 2);
    const y = Math.floor((rows - dialogHeight) / 2);
    const framed = dialogWidth >= 8 && dialogHeight >= 5;
    const border = framed ? 1 : 0;
    const inner = this.renderContent(dialogWidth - border * 2, dialogHeight - border * 2, true);
    if (framed)
      backdrop.box(x, y, dialogWidth, dialogHeight, { fg: THEME.border, bg: THEME.background });
    backdrop.copy(inner.canvas, x + border, y + border, 0, inner.canvas.height);
    const layout = {
      ...inner,
      canvas: backdrop,
      regions: inner.regions.map((region) => ({
        ...region,
        x: region.x + x + border,
        y: region.y + y + border,
      })),
      bodyTop: inner.bodyTop + y + border,
      icons: [],
    };
    this.lastLayout = layout;
    return layout;
  }

  private renderContent(columns: number, rows: number, modal = false): WizardLayout {
    columns = Math.max(1, Math.floor(columns));
    rows = Math.max(1, Math.floor(rows));
    const size = columns + ':' + rows;
    const resized = !!this.contentSize && this.contentSize !== size;
    this.contentSize = size;
    if (resized) this.revealFocus = true;
    const canvas = new TerminalCanvas(columns, rows);
    const tiny = columns < 30 || rows < 10;
    const margin =
      columns >= 80 ? Math.max(3, Math.floor((columns - 124) / 2)) : columns >= 30 ? 2 : 0;
    const width = Math.max(1, columns - margin * 2 - 1);
    const largeBrand = !modal && width >= 71 && rows >= 20;
    const headerHeight = modal
      ? rows >= 5
        ? 2
        : rows >= 3
          ? 1
          : 0
      : largeBrand
        ? 7
        : rows >= 18
          ? 3
          : rows >= 4
            ? 1
            : 0;
    const footerHeight = rows >= 18 ? 3 : rows >= 7 ? 2 : rows >= 3 ? 1 : 0;
    const bodyTop = headerHeight;
    const bodyHeight = Math.max(1, rows - headerHeight - footerHeight);
    const regions: HitRegion[] = [];
    const bodyRegions: HitRegion[] = [];
    const icons: TerminalIconPlacement[] = [];
    const body = new TerminalCanvas(width, 160);
    const icon = (id: ProviderId, x: number, row: number, size: number, background: string) => {
      if (!this.nativeIcons) renderProviderIcon(body, id, x, row, size, background);
      else body.fill(x, row, size, size / 2, { bg: background });
      icons.push({ providerId: id, x, y: row, columns: size, rows: size / 2, background });
    };
    let y = 0;
    const add = (id: string, x: number, row: number, w: number, h = 1, disabled = false) =>
      bodyRegions.push({ id, x, y: row, width: w, height: h, body: true, disabled });
    const text = (value: string, style: { fg?: string; bold?: boolean } = {}, lines = 0) => {
      const content = wrapText(value, width);
      for (const line of content.slice(0, lines || 8)) body.text(0, y++, line, style);
    };
    const button = (
      id: string,
      label: string,
      row: number,
      x = 0,
      w = textWidth(label) + 4,
      disabled = false
    ) => {
      const focused = this.focus === id;
      const hovered = this.hover === id && !disabled;
      const bg = focused && !disabled ? THEME.primary : hovered ? THEME.border : THEME.element;
      body.fill(x, row, Math.min(width - x, w), 1, { bg });
      body.text(x, row, fitText((focused ? '› ' : '  ') + label, Math.min(width - x, w)), {
        bg,
        fg: disabled ? THEME.muted : focused ? THEME.background : THEME.text,
        bold: focused,
      });
      add(id, x, row, Math.min(width - x, w), 1, disabled);
    };
    const field = (id: string, label: string, value: string, placeholder: string) => {
      text(label, { fg: THEME.muted });
      const focused = this.focus === id;
      const hovered = this.hover === id;
      const fieldWidth = Math.max(1, width - 2);
      let shown = value || placeholder;
      if (focused) shown = inputDisplay(value, this.cursor, fieldWidth);
      body.fill(0, y, width, 1, { bg: hovered ? THEME.border : THEME.element });
      body.text(0, y, fitText((focused ? '› ' : '  ') + shown, width), {
        fg: value || focused ? THEME.text : THEME.muted,
        bg: (this.selectAll && focused) || hovered ? THEME.border : THEME.element,
      });
      add(id, 0, y, width);
      y += 2;
    };
    const toggle = (id: string, label: string, detail: string, checked: boolean | string) => {
      const focused = this.focus === id;
      const hovered = this.hover === id;
      const bg = hovered ? THEME.element : THEME.background;
      const marker = typeof checked === 'boolean' ? (checked ? '[✓]' : '[ ]') : '[' + checked + ']';
      const shortLabel =
        label === 'Default provider'
          ? 'Provider'
          : label === 'Provider view'
            ? 'View'
            : label === 'Parallel downloads'
              ? 'Downloads'
              : label;
      const caption =
        tiny && typeof checked === 'string' ? shortLabel + ': ' + checked : marker + ' ' + label;
      body.fill(0, y, width, tiny ? 1 : 2, { bg });
      body.text(0, y, fitText((focused ? '› ' : '  ') + caption, width), {
        fg: focused ? THEME.primary : THEME.text,
        bold: focused,
        bg,
      });
      add(id, 0, y, width, tiny ? 1 : 2);
      y++;
      if (!tiny) {
        body.text(2, y++, fitText(detail, width - 2), { fg: THEME.muted, bg });
        y++;
      }
    };

    let pageSize = 1,
      pageCount = 1,
      gridColumns = 1,
      providers: ProviderId[] = [];
    if (this.screen === 'onboarding') {
      text('A local home for your websites.', { bold: true });
      y++;
      text('Choose a provider, paste a public URL, and save its pages and assets in a folder.');
      y++;
      text('Your place is saved. Go back to any completed step without retyping.', {
        fg: THEME.muted,
      });
      y++;
      text('Use arrow keys and Enter, or click. Scroll with your mouse wheel.');
      y++;
      text('Preferences and your draft stay on this device in ~/.fexport.', { fg: THEME.muted });
      y++;
      toggle(
        'setting:launchUi',
        'Open the browser UI too',
        'Run both interfaces while you work.',
        this.preferences.launchUi
      );
      toggle(
        'setting:betaUpdates',
        'Include beta updates',
        'Stable updates are the default.',
        this.preferences.betaUpdates
      );
    } else if (this.screen === 'settings') {
      text('Saved automatically in ~/.fexport/settings.json', { fg: THEME.muted });
      y++;
      toggle(
        'setting:defaultProvider',
        'Default provider',
        'Enter cycles through the available providers.',
        providerPresentation(this.preferences.defaultProvider).name
      );
      toggle(
        'setting:viewMode',
        'Provider view',
        'Cards show icons and descriptions.',
        this.preferences.viewMode
      );
      toggle(
        'setting:launchUi',
        'Open browser UI in parallel',
        'Start the local web interface with the terminal.',
        this.preferences.launchUi
      );
      toggle(
        'setting:checkUpdates',
        'Check for updates',
        'Check npm at most once a day.',
        this.preferences.checkUpdates
      );
      toggle(
        'setting:autoInstallUpdates',
        'Install updates automatically',
        'Only updates a supported npm installation.',
        this.preferences.autoInstallUpdates
      );
      toggle(
        'setting:betaUpdates',
        'Include beta updates',
        'Receive previews before the stable release.',
        this.preferences.betaUpdates
      );
      toggle(
        'setting:reduceMotion',
        'Reduce motion',
        'Keep progress and transitions quiet.',
        this.preferences.reduceMotion
      );
      toggle(
        'setting:prettyPrint',
        'Format exported JavaScript',
        'Default for new exports.',
        this.preferences.prettyPrint
      );
      toggle(
        'setting:includeSubpages',
        'Include sub-pages',
        'Default for new exports.',
        this.preferences.includeSubpages
      );
      toggle(
        'setting:concurrency',
        'Parallel downloads',
        'Default for new exports.',
        String(this.preferences.concurrency)
      );
      y++;
      button('settings:reset', 'Reset program…', y++, 0, Math.min(width, 22));
      y++;
      text('Restore defaults and clear the saved draft. Exported folders are kept.', {
        fg: THEME.muted,
      });
    } else if (this.screen === 'reset') {
      text('Reset Framer Export?', { bold: true });
      y++;
      text(
        'This clears your preferences, saved draft and update cache. Your exported websites are kept.'
      );
      y++;
      text('The welcome screen will appear again.', { fg: THEME.muted });
    } else if (this.screen === 'opening-ui') {
      text(this.uiOpening ? 'Opening UI' : this.uiAddress ? 'UI Open' : 'Unable to open UI', {
        bold: true,
      });
      y++;
      text(
        this.uiOpening
          ? 'Starting the browser interface…'
          : this.uiAddress
            ? 'Your browser interface is ready.'
            : 'Close this dialog and try again.'
      );
      y++;
      if (this.uiAddress) text(this.uiAddress, { fg: THEME.primary });
      y++;
      text('You can close this dialog and continue here. Your draft is kept.', { fg: THEME.muted });
    } else if (this.screen === 'help') {
      text('Keyboard & mouse', { bold: true });
      y++;
      for (const item of [
        'Tab / Shift+Tab   Move between controls',
        'Arrow keys   Browse providers and options',
        'Enter   Select, continue or activate',
        'Space   Toggle a checkbox',
        'Esc / Alt+Left   Previous step',
        'Page Up / Page Down   Change page',
        'Ctrl+A   Select the field text',
        'Home / End   Move within a field',
        'Ctrl+U   Clear a field',
        ',   Open preferences',
        '?   Show these shortcuts',
        'Ctrl+C   Save draft and exit',
        'Mouse wheel   Scroll; drag the scrollbar',
      ]) {
        text(item);
        y++;
      }
    } else {
      text(WIZARD_STEPS[this.draft.step], { bold: true });
      if (!tiny && this.draft.step !== 0) y++;
      if (this.draft.step === 0) {
        const searchFocused = this.focus === 'field:query';
        body.fill(0, y, width, 1, { bg: THEME.element });
        body.text(
          0,
          y,
          fitText(
            (searchFocused ? '› ' : '  ') +
              (searchFocused
                ? inputDisplay(this.query, this.cursor, width - 2)
                : this.query || 'Search providers'),
            width
          ),
          {
            fg: this.query || searchFocused ? THEME.text : THEME.muted,
            bg: this.selectAll && searchFocused ? THEME.border : THEME.element,
          }
        );
        add('field:query', 0, y++, width);
        button('view:cards', 'Cards', y, 0, Math.min(11, width));
        if (width >= 20) button('view:list', 'List', y, 12, Math.min(10, width - 12));
        else {
          y++;
          button('view:list', 'List', y);
        }
        y += 2;
        const query = this.query.toLowerCase();
        providers = PROVIDERS.filter((id) => {
          const entry = providerPresentation(id);
          const category =
            PLATFORM_REGISTRY.find((item) => item.name === id)?.category || 'automatic';
          return (entry.name + ' ' + entry.description + ' ' + category)
            .toLowerCase()
            .includes(query);
        });
        const cards = this.preferences.viewMode === 'cards' && width >= 28;
        gridColumns = cards ? (width >= 108 ? 3 : width >= 66 ? 2 : 1) : 1;
        const cardHeight = cards ? 7 : width >= 64 ? 3 : 2;
        pageSize = cards
          ? gridColumns *
            Math.max(1, Math.min(3, Math.floor((bodyHeight - y - 3) / (cardHeight + 1))))
          : Math.max(6, Math.min(12, Math.ceil((bodyHeight - y - 3) / cardHeight)));
        pageCount = Math.max(1, Math.ceil(providers.length / pageSize));
        if (!this.galleryInitialized) {
          this.page = Math.floor(
            Math.max(0, providers.indexOf(this.draft.provider as ProviderId)) / pageSize
          );
          this.galleryInitialized = true;
        }
        if (this.pageAnchor || (resized && this.focus.startsWith('provider:'))) {
          const anchor = this.pageAnchor || (this.focus.slice(9) as ProviderId);
          this.page = Math.floor(Math.max(0, providers.indexOf(anchor)) / pageSize);
          this.pageAnchor = undefined;
        }
        this.page = Math.max(0, Math.min(this.page, pageCount - 1));
        const shown = providers.slice(this.page * pageSize, (this.page + 1) * pageSize);
        if (!shown.length) {
          text('No providers found.', { fg: THEME.muted });
          text('Clear the search to see every provider.');
        }
        const cardWidth = Math.floor((width - (gridColumns - 1) * 2) / gridColumns);
        shown.forEach((id, index) => {
          const presentation = providerPresentation(id),
            selected = this.draft.provider === id,
            focused = this.focus === 'provider:' + id,
            hovered = this.hover === 'provider:' + id;
          const bg = hovered ? THEME.element : cards ? THEME.panel : THEME.background;
          const x = (index % gridColumns) * (cardWidth + 2),
            row = y + Math.floor(index / gridColumns) * (cardHeight + (cards ? 1 : 0));
          if (cards) {
            body.box(x, row, cardWidth, cardHeight, {
              bg,
              fg: focused ? THEME.primary : hovered || selected ? THEME.accent : THEME.border,
            });
            icon(id, x + 2, row + 1, 8, bg);
            body.text(x + 12, row + 1, fitText(presentation.name, cardWidth - 14), {
              bold: true,
              fg: focused ? THEME.primary : THEME.text,
              bg,
            });
            wrapText(presentation.description, cardWidth - 14)
              .slice(0, 2)
              .forEach((line, i) => body.text(x + 12, row + 2 + i, line, { fg: THEME.muted, bg }));
            body.text(
              x + 2,
              row + 5,
              fitText(
                selected ? '[✓] Selected' : id !== 'auto' && isBetaPlatform(id) ? 'Beta' : 'Select',
                cardWidth - 4
              ),
              { fg: selected ? THEME.primary : THEME.muted, bg }
            );
          } else {
            const showIcon = width >= 32;
            body.fill(x, row, cardWidth, cardHeight, { bg });
            if (showIcon) icon(id, x, row, 4, bg);
            body.text(
              x + (showIcon ? 6 : 0),
              row,
              fitText(
                (focused ? '› ' : selected ? '✓ ' : '  ') +
                  presentation.name +
                  (id !== 'auto' && isBetaPlatform(id) ? ' · beta' : ''),
                width - (showIcon ? 6 : 0)
              ),
              { fg: focused ? THEME.primary : THEME.text, bold: selected || focused, bg }
            );
            if (width >= 64)
              body.text(x + 6, row + 1, fitText(presentation.description, width - 6), {
                fg: THEME.muted,
                bg,
              });
          }
          add('provider:' + id, x, row, cardWidth, cardHeight);
        });
        y += Math.ceil(shown.length / gridColumns) * (cardHeight + (cards ? 1 : 0));
        const pageLabel = `${this.page + 1} / ${pageCount} · ${providers.length} providers`;
        text(pageLabel, { fg: THEME.muted });
        button('page:previous', '‹ Previous page', y, 0, Math.min(19, width), this.page === 0);
        if (width >= 39)
          button('page:next', 'Next page ›', y++, 21, 17, this.page >= pageCount - 1);
        else {
          y++;
          button(
            'page:next',
            'Next page ›',
            y++,
            0,
            Math.min(17, width),
            this.page >= pageCount - 1
          );
        }
      } else if (this.draft.step === 1) {
        text(providerPresentation(this.draft.provider).name, { fg: THEME.primary });
        y++;
        field('field:siteUrl', 'Public website URL', this.draft.siteUrl, 'https://your-site.com');
        field(
          'field:outDir',
          'Output folder',
          this.draft.outDir,
          this.draft.siteUrl
            ? suggestedDirectory(this.draft.siteUrl, this.draft.provider)
            : './export'
        );
        text('Files stay on your computer. An empty folder field uses the suggested name.', {
          fg: THEME.muted,
        });
      } else if (this.draft.step === 2) {
        toggle(
          'option:prettyPrint',
          'Format JavaScript',
          'Make exported scripts easier to read.',
          this.draft.prettyPrint
        );
        toggle(
          'option:includeSubpages',
          'Include sub-pages',
          'Follow internal links and save additional pages.',
          this.draft.includeSubpages
        );
        toggle(
          'option:concurrency',
          'Parallel downloads',
          'Balance download speed and network usage.',
          String(this.draft.concurrency)
        );
      } else {
        const provider = providerPresentation(this.draft.provider);
        button(
          'step:0',
          provider.name + ' · Edit provider',
          y++,
          0,
          Math.min(width, textWidth(provider.name) + 22)
        );
        y++;
        for (const [label, value, step] of [
          ['Website', this.draft.siteUrl, 1],
          ['Output folder', path.resolve(this.draft.outDir || './export'), 1],
        ] as const) {
          text(label, { fg: THEME.muted });
          const start = y;
          text(
            value,
            {
              fg:
                this.focus === 'step:' + step || this.hover === 'step:' + step
                  ? THEME.primary
                  : THEME.text,
            },
            tiny ? 2 : 3
          );
          add('step:' + step, 0, start, width, Math.max(1, y - start));
          y++;
        }
        button('step:2', 'Options · Edit', y++, 0, Math.min(width, 18));
        text(
          (this.draft.prettyPrint ? 'Formatted JavaScript' : 'Original JavaScript') +
            ' · ' +
            (this.draft.includeSubpages ? 'Sub-pages included' : 'Entry page only'),
          { fg: THEME.muted }
        );
        text(this.draft.concurrency + ' parallel downloads', { fg: THEME.muted });
      }
    }
    const contentHeight = Math.max(1, y);
    this.scroll = Math.max(0, Math.min(this.scroll, contentHeight - bodyHeight));
    const focusBody = bodyRegions.find((item) => item.id === this.focus);
    if (this.revealFocus && focusBody) {
      if (tiny || focusBody.y < this.scroll || focusBody.height > bodyHeight)
        this.scroll = focusBody.y;
      else if (focusBody.y + focusBody.height > this.scroll + bodyHeight)
        this.scroll = focusBody.y + focusBody.height - bodyHeight;
      this.scroll = Math.max(0, Math.min(Math.max(0, contentHeight - bodyHeight), this.scroll));
    }
    this.revealFocus = false;
    canvas.copy(body, margin, bodyTop, this.scroll, bodyHeight);
    for (const region of bodyRegions)
      regions.push({ ...region, x: region.x + margin, y: bodyTop + region.y - this.scroll });
    if (headerHeight && modal) {
      const title =
        this.screen === 'settings'
          ? 'Settings'
          : this.screen === 'help'
            ? 'Help'
            : this.screen === 'reset'
              ? 'Reset program'
              : this.uiOpening
                ? 'Opening UI'
                : this.uiAddress
                  ? 'UI Open'
                  : 'Open UI';
      canvas.fill(0, 0, columns, headerHeight);
      const closeWidth = Math.min(9, columns);
      const closeX = Math.max(0, columns - closeWidth);
      canvas.text(0, 0, fitText(title, Math.max(0, closeX - 1)), { bold: true });
      const closeBg = this.hover === 'overlay:back' ? THEME.element : THEME.background;
      canvas.text(closeX, 0, fitText(' Close × ', closeWidth), {
        fg: this.focus === 'overlay:back' ? THEME.primary : THEME.text,
        bg: closeBg,
      });
      regions.push({ id: 'overlay:back', x: closeX, y: 0, width: closeWidth, height: 1 });
      if (headerHeight > 1) canvas.text(0, 1, '─'.repeat(columns), { fg: THEME.border });
    } else if (headerHeight) {
      canvas.fill(0, 0, columns, headerHeight, { bg: THEME.background });
      if (largeBrand)
        BRAND_ART.forEach((line, index) => {
          canvas.text(margin, index, line.slice(0, BRAND_SPLIT), { fg: BRAND_COLOR });
          canvas.text(margin + BRAND_SPLIT, index, line.slice(BRAND_SPLIT), { fg: THEME.text });
        });
      else {
        const title =
          headerHeight === 1
            ? this.screen === 'wizard'
              ? `${this.draft.step + 1}/4 ${SHORT_STEPS[this.draft.step]}`
              : this.screen === 'onboarding'
                ? 'Welcome'
                : this.screen === 'settings'
                  ? 'Preferences'
                  : 'Shortcuts'
            : 'framerexport';
        if (title === 'framerexport') {
          canvas.text(margin, 0, 'framer', { fg: BRAND_COLOR, bold: true });
          canvas.text(margin + 6, 0, 'export', { bold: true });
        } else canvas.text(margin, 0, fitText(title, width), { bold: true });
        if (width >= 70) canvas.text(margin + 16, 0, 'v' + pkg.version, { fg: THEME.muted });
      }
      const controls =
        width >= 40
          ? [
              ['open-ui', this.uiAddress ? 'UI Open' : 'Open UI'],
              ['settings', 'Settings'],
              ['help', '?'],
            ]
          : [
              ['settings', '[S]'],
              ['help', '?'],
            ];
      let x = columns - margin - 1;
      const controlsRow = largeBrand ? 4 : 0;
      if (largeBrand) canvas.text(margin, controlsRow, 'v' + pkg.version, { fg: THEME.muted });
      for (const [id, label] of [...controls].reverse()) {
        const w = textWidth(label) + 2;
        x -= w;
        if (x >= margin + 15) {
          canvas.text(x, controlsRow, ' ' + label + ' ', {
            fg: this.focus === id ? THEME.primary : THEME.muted,
            bg: this.hover === id ? THEME.element : THEME.background,
          });
          regions.push({ id, x, y: controlsRow, width: w, height: 1 });
        }
      }
      const stepRow = largeBrand ? 5 : 1;
      if (headerHeight > 1 && this.screen === 'wizard') {
        const labels =
          width >= 79 ? WIZARD_STEPS : width >= 46 ? SHORT_STEPS : [SHORT_STEPS[this.draft.step]];
        let x = margin;
        labels.forEach((label, index) => {
          const step = labels.length === 1 ? this.draft.step : index;
          const complete = step < this.visited && (step < 1 || validSiteUrl(this.draft.siteUrl));
          const value = `${complete ? '[✓]' : step + 1} ${label}`;
          canvas.text(x, stepRow, fitText(value, columns - margin - x), {
            fg: step === this.draft.step ? THEME.primary : complete ? THEME.text : THEME.muted,
            bold: step === this.draft.step,
            bg:
              this.hover === 'step:' + step && step <= this.visited
                ? THEME.element
                : THEME.background,
          });
          regions.push({
            id: 'step:' + step,
            x,
            y: stepRow,
            width: textWidth(value),
            height: 1,
            disabled: step > this.visited,
          });
          x += textWidth(value) + 1;
          if (index < labels.length - 1) {
            canvas.text(x, stepRow, '→', { fg: THEME.border });
            x += 2;
          }
        });
      } else if (headerHeight > 1)
        canvas.text(
          margin,
          stepRow,
          this.screen === 'onboarding'
            ? 'Welcome'
            : this.screen === 'settings'
              ? 'Preferences'
              : 'Shortcuts',
          { fg: THEME.primary }
        );
      if (headerHeight > 1)
        canvas.text(margin, headerHeight - 1, '─'.repeat(width), { fg: THEME.border });
    }
    const providerCards =
      this.screen === 'wizard' && this.draft.step === 0 && this.preferences.viewMode === 'cards';
    const providerList =
      this.screen === 'wizard' && this.draft.step === 0 && this.preferences.viewMode === 'list';
    if (!providerCards && (contentHeight > bodyHeight || providerList) && columns > 1) {
      const x = columns - 1,
        thumb = Math.max(
          1,
          Math.min(bodyHeight, Math.floor((bodyHeight * bodyHeight) / contentHeight))
        );
      const start = Math.round(
        (this.scroll / Math.max(1, contentHeight - bodyHeight)) * (bodyHeight - thumb)
      );
      for (let row = 0; row < bodyHeight; row++)
        canvas.text(x, bodyTop + row, row >= start && row < start + thumb ? '█' : '│', {
          fg: row >= start && row < start + thumb ? THEME.primary : THEME.border,
        });
      regions.push({ id: 'scrollbar', x, y: bodyTop, width: 1, height: bodyHeight });
    }
    if (footerHeight) {
      const top = rows - footerHeight;
      canvas.fill(0, top, columns, footerHeight);
      if (footerHeight >= 3)
        canvas.text(
          margin,
          top,
          fitText(
            this.error ||
              this.notice ||
              (this.uiAddress
                ? 'UI: ' + this.uiAddress
                : 'Tab to move · Enter to select · Esc to go back'),
            width
          ),
          { fg: this.error ? THEME.error : THEME.muted }
        );
      const row = rows - (footerHeight >= 3 ? 1 : 1);
      const footerButton = (
        id: string,
        label: string,
        x: number,
        w: number,
        primary = false,
        disabled = false
      ) => {
        w = Math.min(w, columns - x);
        if (x < 0 || w < 1) return;
        const bg = disabled
          ? THEME.element
          : primary
            ? this.hover === id
              ? THEME.accent
              : THEME.primary
            : this.focus === id || this.hover === id
              ? THEME.element
              : THEME.background;
        canvas.fill(x, row, w, 1, { bg });
        canvas.text(x, row, fitText((this.focus === id ? '› ' : '  ') + label, w), {
          fg: disabled
            ? THEME.muted
            : primary
              ? THEME.background
              : this.focus === id
                ? THEME.primary
                : THEME.text,
          bg,
          bold: primary,
        });
        regions.push({ id, x, y: row, width: w, height: 1, disabled });
      };
      if (this.screen === 'wizard') {
        const next = this.draft.step === 3 ? 'Start export' : 'Next →';
        const nextWidth = Math.min(width, textWidth(next) + 4);
        footerButton(
          'back',
          this.draft.step === 0 ? 'Exit' : '← Back',
          margin,
          Math.min(12, Math.max(1, width - nextWidth))
        );
        footerButton(
          'next',
          next,
          Math.max(margin, columns - margin - nextWidth - 1),
          nextWidth,
          true,
          this.draft.step === 1 && !validSiteUrl(this.draft.siteUrl)
        );
      } else if (this.modal) {
        footerButton(
          'overlay:back',
          this.screen === 'reset' ? 'Cancel' : 'Close',
          margin,
          Math.min(width, 12)
        );
        if (this.screen === 'reset') {
          const w = Math.min(width, 17);
          footerButton(
            'reset:confirm',
            'Reset program',
            Math.max(margin, columns - margin - w - 1),
            w,
            true
          );
        }
      } else {
        footerButton('welcome:continue', 'Get started', margin, Math.min(width, 17), true);
        if (width >= 29) footerButton('welcome:skip', 'Skip', margin + 20, 8);
      }
    }
    const tooltip =
      this.hover === 'next' && this.draft.step === 1 && !validSiteUrl(this.draft.siteUrl)
        ? this.draft.siteUrl.trim()
          ? 'Enter a valid public website URL to continue'
          : 'Missing field: enter the website URL to continue'
        : TOOLTIPS[this.hover];
    const target =
      tooltip &&
      regions.find(
        (item) =>
          item.id === this.hover &&
          (!item.body || (item.y >= bodyTop && item.y < bodyTop + bodyHeight))
      );
    if (target && columns >= 24 && rows >= 6) {
      const w = Math.min(columns - 2, textWidth(tooltip) + 2);
      const lines = wrapText(tooltip, w - 2).slice(0, 3);
      const x = Math.max(0, Math.min(columns - w, target.x));
      const y =
        target.y + target.height + lines.length < rows
          ? target.y + target.height
          : Math.max(0, target.y - lines.length);
      canvas.fill(x, y, w, lines.length, { bg: THEME.element });
      lines.forEach((line, i) =>
        canvas.text(x + 1, y + i, line, { bg: THEME.element, fg: THEME.text })
      );
    }
    const layout = {
      canvas,
      regions,
      bodyTop,
      bodyHeight,
      contentHeight,
      pageSize,
      pageCount,
      gridColumns,
      providers,
      icons: icons
        .filter((icon) => icon.y >= this.scroll && icon.y + icon.rows <= this.scroll + bodyHeight)
        .map((icon) => ({ ...icon, x: icon.x + margin, y: icon.y + bodyTop - this.scroll })),
    };
    if (!modal && !process.env.FRAMER_EXPORT_NO_BG)
      canvas.decorateBackground(
        terminalPixelBlast(
          columns,
          rows,
          this.preferences.reduceMotion ? 0 : this.animationTime,
          this.preferences.reduceMotion ? [] : this.ripples
        )
      );
    this.lastLayout = layout;
    return layout;
  }
}

function renderProviderIcon(
  canvas: TerminalCanvas,
  id: string,
  x: number,
  y: number,
  size: number,
  background: string
): void {
  const mark = providerMonogram(id);
  const color = /^#[0-9a-f]{6}$/i.test(providerPresentation(id).color)
    ? providerPresentation(id).color
    : THEME.text;
  canvas.fill(x, y, size, size / 2, { bg: background });
  canvas.text(
    x + Math.max(0, Math.floor((size - textWidth(mark)) / 2)),
    y + Math.max(0, Math.floor((size / 2 - 1) / 2)),
    mark,
    { fg: color === '#000000' ? THEME.text : color, bg: background, bold: true }
  );
}

export async function runWizard(options: WizardOptions): Promise<ExportDraft | null> {
  const model = new WizardModel(options);
  const images = new TerminalIconRenderer(await detectTerminalImageSupport());
  model.nativeIcons = images.mode !== 'text';
  return new Promise((resolve, reject) => {
    let previous: string[] = [],
      timer: NodeJS.Timeout | undefined;
    let active = true;
    let probing = false;
    const started = Date.now();
    const depth = process.env.NO_COLOR !== undefined ? 1 : stdout.getColorDepth?.() || 8;
    const input = new RawInput((event) => {
      try {
        model.handle(event);
        draw();
      } catch (error) {
        cleanup();
        reject(error);
      }
    });
    const cleanup = () => {
      if (!active) return;
      active = false;
      if (timer) clearInterval(timer);
      input.stop();
      stdout.off('resize', resize);
      process.off('SIGTERM', terminate);
      stdout.write(images.cleanup());
      stdout.write('\x1b[?2004l\x1b[?1006l\x1b[?1003l\x1b[?7h\x1b[0m\x1b[?25h\x1b[?1049l');
    };
    const draw = () => {
      if (!active || probing) return;
      if (model.finished || model.cancelled) {
        cleanup();
        resolve(model.finished ? model.draft : null);
        return;
      }
      const layout = model.render(stdout.columns || 80, stdout.rows || 24);
      const lines = layout.canvas.lines(depth);
      const frame = images.frame(
        layout.icons,
        { columns: layout.canvas.width, rows: layout.canvas.height },
        lines.length !== previous.length || lines.some((line, index) => line !== previous[index])
      );
      stdout.write(
        frame.before + paintTerminal(lines, frame.forceRepaint ? [] : previous) + frame.after
      );
      previous = lines;
    };
    const resize = () => {
      previous = [];
      if (images.mode === 'sixel' && !probing) {
        probing = true;
        input.stop();
        void detectTerminalImageSupport()
          .then((support) => {
            if (!active) return;
            stdout.write(images.setSupport(support));
            model.nativeIcons = images.mode !== 'text';
            probing = false;
            input.start();
            draw();
          })
          .catch((error) => {
            cleanup();
            reject(error);
          });
        return;
      }
      draw();
    };
    const terminate = () => {
      model.activate('cancel');
      cleanup();
      resolve(null);
    };
    stdout.write('\x1b[?1049h\x1b[?25l\x1b[?1003h\x1b[?1006h\x1b[?2004h');
    stdout.on('resize', resize);
    process.once('SIGTERM', terminate);
    input.start();
    draw();
    let lastNotice = model.notice + model.error + model.uiAddress + model.uiOpening;
    timer = setInterval(() => {
      const notice = model.notice + model.error + model.uiAddress + model.uiOpening;
      const animate = !model.preferences.reduceMotion && images.mode === 'text';
      if (animate) model.animationTime = (Date.now() - started) / 1000;
      if (notice !== lastNotice || animate) {
        lastNotice = notice;
        draw();
      }
    }, 150);
  });
}
