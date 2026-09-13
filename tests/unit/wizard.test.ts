import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultPreferences,
  type ExportDraft,
  type Preferences,
} from '../../src/cli/preferences.js';
import { WizardModel, validSiteUrl, type WizardLayout } from '../../src/cli/wizard.js';
import { textWidth } from '../../src/cli/terminal-screen.js';
import type { InputEvent } from '../../src/cli/input.js';

function create(preferences: Partial<Preferences> = {}, draft?: ExportDraft) {
  const saved: ExportDraft[] = [];
  let persisted = {
    ...defaultPreferences,
    onboardingCompleted: true,
    checkUpdates: false,
    ...preferences,
  };
  const model = new WizardModel({
    preferences: persisted,
    draft,
    savePreferences: (patch) => (persisted = { ...persisted, ...patch }),
    saveDraft: (value) => saved.push({ ...value }),
  });
  model.render(100, 30);
  return { model, saved, preferences: () => persisted };
}

function event(model: WizardModel, value: InputEvent, columns = 100, rows = 30) {
  model.handle(value);
  return model.render(columns, rows);
}

function completeDetails(model: WizardModel) {
  model.activate('provider:webflow');
  model.activate('next');
  model.render(100, 30);
  event(model, { type: 'paste', text: 'https://example.com/project?lang=fr' });
  event(model, { type: 'key', name: 'return' });
  event(model, { type: 'paste', text: './Export été 界' });
  event(model, { type: 'key', name: 'return' });
}

function click(model: WizardModel, layout: WizardLayout, id: string) {
  const region = layout.regions.find((item) => item.id === id && !item.disabled)!;
  assert.ok(region, `Missing ${id}`);
  return event(model, { type: 'mouse', kind: 'click', x: region.x + 1, y: region.y + 1 });
}

test('onboarding completes once and preserves selected preferences', () => {
  const { model, preferences } = create({ onboardingCompleted: false });
  assert.equal(model.screen, 'onboarding');
  model.activate('setting:betaUpdates');
  model.activate('welcome:continue');
  assert.equal(model.screen, 'wizard');
  assert.equal(preferences().onboardingCompleted, true);
  assert.equal(preferences().betaUpdates, true);
  const restarted = new WizardModel({ preferences: preferences() });
  assert.equal(restarted.screen, 'wizard');
});

test('first-launch onboarding shows its introduction without scrolling to a duplicate action', () => {
  for (const [columns, rows] of [
    [120, 40],
    [80, 24],
    [40, 12],
    [20, 6],
  ]) {
    const model = new WizardModel({ preferences: { ...defaultPreferences } });
    const layout = model.render(columns, rows);
    const lines = layout.canvas.lines(1);
    assert.equal(model.scroll, 0, `onboarding skipped the introduction at ${columns}x${rows}`);
    assert.ok(
      lines
        .slice(layout.bodyTop, layout.bodyTop + layout.bodyHeight)
        .join('\n')
        .includes('A local home'),
      `introduction is not visible at ${columns}x${rows}`
    );
    assert.equal(
      lines.join('\n').match(/Get started/g)?.length,
      1,
      `primary action is duplicated at ${columns}x${rows}`
    );
  }
});

test('back buttons and completed step links retain all entered export data', () => {
  const { model, saved } = create();
  completeDetails(model);
  assert.equal(model.draft.step, 2);
  model.activate('option:prettyPrint');
  model.activate('option:includeSubpages');
  model.activate('option:concurrency');
  model.activate('next');
  let layout = model.render(100, 30);
  assert.equal(model.draft.step, 3);
  assert.ok(layout.canvas.lines(1).some((line) => line.includes('[✓]')));
  const completed = { ...model.draft };
  layout = click(model, layout, 'step:0');
  assert.equal(model.draft.step, 0);
  model.activate('next');
  model.activate('next');
  model.activate('next');
  assert.deepEqual(model.draft, completed);
  model.activate('back');
  assert.equal(model.draft.step, 2);
  assert.equal(model.draft.siteUrl, 'https://example.com/project?lang=fr');
  assert.equal(model.draft.outDir, './Export été 界');
  assert.equal(model.draft.prettyPrint, false);
  assert.equal(model.draft.includeSubpages, true);
  assert.equal(model.draft.concurrency, 20);
  assert.ok(saved.length >= 4);
});

test('uncompleted steps and invalid website details cannot bypass validation', () => {
  const { model } = create();
  model.activate('step:3');
  assert.equal(model.draft.step, 0);
  model.activate('next');
  model.activate('next');
  assert.equal(model.draft.step, 1);
  assert.match(model.error, /https/);
  for (const url of [
    'file:///tmp/file',
    'javascript:alert(1)',
    'https://user:pass@example.com',
    'not a URL',
  ])
    assert.equal(validSiteUrl(url), false);
  assert.equal(validSiteUrl('https://example.com/path?a=1'), true);
});

test('keyboard provider navigation selects the focused provider when continuing', () => {
  const { model } = create({ viewMode: 'list' });
  const layout = event(model, { type: 'key', name: 'down' });
  assert.equal(model.focus, 'provider:' + layout.providers[1]);
  event(model, { type: 'key', name: 'return' });
  assert.equal(model.draft.provider, layout.providers[1]);
  assert.equal(model.draft.step, 1);
});

test('search, pagination and view changes produce reachable provider choices', () => {
  const { model, preferences } = create();
  let layout = model.render(80, 24);
  assert.ok(layout.pageCount > 1);
  model.activate('page:next');
  layout = model.render(80, 24);
  assert.equal(model.page, 1);
  model.activate('field:query');
  layout = event(model, { type: 'paste', text: 'notion' }, 80, 24);
  assert.equal(model.page, 0);
  assert.deepEqual(layout.providers, ['notion']);
  model.activate('view:list');
  layout = model.render(80, 24);
  assert.equal(preferences().viewMode, 'list');
  assert.equal(layout.gridColumns, 1);
  event(model, { type: 'key', name: 'return' });
  assert.equal(model.draft.provider, 'notion');
});

test('editing text supports selection, deletion, unicode paste and saved cancellation', () => {
  const { model, saved } = create();
  model.activate('next');
  model.render(100, 30);
  event(model, { type: 'paste', text: 'https://old.example.com' });
  event(model, { type: 'key', name: 'ctrl-a' });
  event(model, { type: 'paste', text: 'https://new.example.com/é界' });
  assert.equal(model.draft.siteUrl, 'https://new.example.com/é界');
  event(model, { type: 'key', name: 'backspace' });
  assert.equal(model.draft.siteUrl, 'https://new.example.com/é');
  event(model, { type: 'paste', text: '\x1b[2J\r\n/clean' });
  assert.equal(model.draft.siteUrl, 'https://new.example.com/é/clean');
  event(model, { type: 'key', name: 'ctrl-c' });
  assert.equal(model.cancelled, true);
  assert.equal(saved.at(-1)?.siteUrl, model.draft.siteUrl);
});

test('restored drafts keep options and return to URL details if an unfinished URL was saved', () => {
  const draft: ExportDraft = {
    schemaVersion: 1,
    provider: 'notion',
    siteUrl: 'https://',
    outDir: './kept',
    prettyPrint: false,
    includeSubpages: true,
    concurrency: 6,
    step: 3,
  };
  const { model } = create({}, draft);
  assert.equal(model.draft.step, 1);
  assert.equal(model.draft.outDir, './kept');
  assert.equal(model.draft.includeSubpages, true);
  assert.equal(model.draft.prettyPrint, false);
  assert.match(model.notice, /restored/i);
});

test('field cursor movement and deletion preserve complete emoji and accented graphemes', () => {
  const { model } = create();
  model.activate('next');
  model.activate('field:outDir');
  model.render(100, 30);
  event(model, { type: 'paste', text: 'A👩🏽‍💻e\u0301B' });
  event(model, { type: 'key', name: 'left' });
  event(model, { type: 'key', name: 'backspace' });
  assert.equal(model.draft.outDir, 'A👩🏽‍💻B');
  event(model, { type: 'key', name: 'left' });
  assert.equal(model.cursor, 1);
  event(model, { type: 'key', name: 'delete' });
  assert.equal(model.draft.outDir, 'AB');
  assert.equal(model.cursor, 1);
});

test('settings and help overlays return to the same step and field without replacing draft values', () => {
  const { model } = create();
  completeDetails(model);
  const before = { ...model.draft };
  const focus = model.focus;
  model.activate('settings');
  model.activate('setting:includeSubpages');
  model.activate('overlay:back');
  assert.equal(model.screen, 'wizard');
  assert.equal(model.focus, focus);
  assert.deepEqual(model.draft, before);
  model.activate('help');
  model.activate('overlay:back');
  assert.deepEqual(model.draft, before);
});

test('mouse wheel and scrollbar drag remain bounded and expose hidden settings', () => {
  const { model } = create();
  model.activate('settings');
  let layout = model.render(40, 12);
  assert.ok(layout.contentHeight > layout.bodyHeight);
  for (let i = 0; i < 100; i++)
    layout = event(model, { type: 'mouse', kind: 'wheel-down', x: 20, y: 6 }, 40, 12);
  assert.equal(model.scroll, layout.contentHeight - layout.bodyHeight);
  const bar = layout.regions.find((region) => region.id === 'scrollbar')!;
  event(model, { type: 'mouse', kind: 'press', x: bar.x + 1, y: bar.y + 1 }, 40, 12);
  event(model, { type: 'mouse', kind: 'move', x: bar.x + 1, y: -50 }, 40, 12);
  assert.equal(model.scroll, 0);
  event(model, { type: 'mouse', kind: 'click', x: bar.x + 1, y: bar.y + 1 }, 40, 12);
  for (let i = 0; i < 30; i++) layout = event(model, { type: 'key', name: 'tab' }, 40, 12);
  assert.ok(model.scroll >= 0);
  assert.ok(model.scroll <= layout.contentHeight - layout.bodyHeight);
});

test('all screens remain inside 1x1, 20x6, 40x12, 80x24 and 120x40 viewports', () => {
  for (const [columns, rows] of [
    [1, 1],
    [20, 6],
    [40, 12],
    [80, 24],
    [120, 40],
  ]) {
    for (const screen of ['onboarding', 'wizard', 'settings', 'help'] as const) {
      const { model } = create();
      model.screen = screen;
      model.draft.siteUrl = 'https://example.com/é界/long/path';
      model.draft.outDir = './Export été 界 / very long nested folder';
      for (const step of [0, 1, 2, 3]) {
        model.draft.step = step;
        const layout = model.render(columns, rows);
        for (const depth of [1, 8, 24]) {
          const lines = layout.canvas.lines(depth);
          assert.equal(lines.length, rows);
          for (const line of lines)
            assert.equal(
              textWidth(line),
              columns,
              `${screen} step${step} ${columns}x${rows}: ${line}`
            );
        }
      }
    }
  }
});

test('keyboard navigation keeps the focused provider visible in a small terminal', () => {
  const { model } = create({ viewMode: 'list' });
  model.render(20, 6);
  const layout = event(model, { type: 'key', name: 'down' }, 20, 6);
  const focused = layout.regions.find((region) => region.id === model.focus)!;
  assert.ok(focused.y >= layout.bodyTop, 'focused provider is above the body');
  assert.ok(focused.y < layout.bodyTop + layout.bodyHeight, 'focused provider is below the body');
});

test('resizing changes pagination while retaining the focused provider on its visible page', () => {
  const { model } = create({ viewMode: 'list' });
  model.render(120, 40);
  event(model, { type: 'key', name: 'end' }, 120, 40);
  const focus = model.focus;
  for (const [columns, rows] of [
    [20, 6],
    [120, 40],
    [40, 12],
    [80, 24],
  ]) {
    const layout = model.render(columns, rows);
    assert.equal(model.focus, focus);
    const region = layout.regions.find((item) => item.id === focus);
    assert.ok(region, `focused provider disappeared at ${columns}x${rows}`);
    assert.ok(
      region.y >= layout.bodyTop && region.y < layout.bodyTop + layout.bodyHeight,
      `focused provider not visible at ${columns}x${rows}`
    );
  }
});
