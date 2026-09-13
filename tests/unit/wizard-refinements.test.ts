import assert from 'node:assert/strict';
import test from 'node:test';
import { WizardModel, type WizardLayout } from '../../src/cli/wizard.js';
import { defaultPreferences } from '../../src/cli/preferences.js';
import { BRAND_ART } from '../../src/cli/banner.js';
import { TerminalCanvas } from '../../src/cli/terminal-screen.js';
import { terminalPixelBlast } from '../../src/cli/backdrop.js';

function create() {
  return new WizardModel({
    preferences: { ...defaultPreferences, onboardingCompleted: true, reduceMotion: true },
  });
}
function point(model: WizardModel, layout: WizardLayout, id: string, kind: 'move' | 'click') {
  const target = layout.regions.find((region) => region.id === id);
  assert.ok(target, id);
  model.handle({ type: 'mouse', kind, x: target.x + 1, y: target.y + 1 });
  return model.render(layout.canvas.width, layout.canvas.height);
}

test('hover changes controls and provider surfaces without changing the selected provider', () => {
  for (const viewMode of ['cards', 'list'] as const) {
    const model = create();
    model.preferences.viewMode = viewMode;
    let layout = model.render(120, 40);
    const selection = model.draft.provider;
    const target = layout.regions.find(
      (region) => region.id.startsWith('provider:') && region.id !== 'provider:' + selection
    )!;
    const before = layout.canvas.lines(24).join('');
    layout = point(model, layout, target.id, 'move');
    assert.notEqual(layout.canvas.lines(24).join(''), before);
    assert.equal(model.draft.provider, selection);
    assert.equal(model.draft.step, 0);
    layout = point(model, layout, 'help', 'move');
    assert.ok(layout.canvas.lines(1).join('\n').includes('Keyboard shortcuts'));
    model.handle({ type: 'mouse', kind: 'move', x: 1, y: 1 });
    assert.equal(model.hover, '');
  }
});

test('only provider list mode displays the right scrollbar', () => {
  const model = create();
  for (const [columns, rows] of [
    [80, 24],
    [40, 12],
    [20, 6],
  ]) {
    model.preferences.viewMode = 'cards';
    assert.equal(
      model.render(columns, rows).regions.some((region) => region.id === 'scrollbar'),
      false
    );
    model.preferences.viewMode = 'list';
    assert.equal(
      model.render(columns, rows).regions.some((region) => region.id === 'scrollbar'),
      true
    );
  }
});

test('empty URL disables Continue and explains the missing field on hover', () => {
  const model = create();
  model.activate('next');
  let layout = model.render(80, 24);
  assert.equal(layout.regions.find((region) => region.id === 'next')?.disabled, true);
  layout = point(model, layout, 'next', 'move');
  assert.ok(layout.canvas.lines(1).join('\n').includes('Missing field'));
  point(model, layout, 'next', 'click');
  assert.equal(model.draft.step, 1);
  model.draft.siteUrl = 'https://example.com';
  layout = model.render(80, 24);
  assert.equal(layout.regions.find((region) => region.id === 'next')?.disabled, false);
});

test('nested modal close restores the prior dialog and the exact draft context', () => {
  const model = create();
  model.activate('next');
  model.draft.siteUrl = 'https://example.com/project';
  model.focus = 'field:siteUrl';
  const draft = { ...model.draft };
  let layout = model.render(120, 40);
  layout = point(model, layout, 'settings', 'click');
  assert.equal(model.screen, 'settings');
  assert.ok(layout.canvas.lines(1).join('\n').includes('Close'));
  assert.ok(
    layout.regions.every(
      (region) => !region.id.startsWith('provider:') && !region.id.startsWith('step:')
    )
  );
  model.activate('settings');
  model.activate('help');
  model.render(120, 40);
  model.activate('overlay:back');
  assert.equal(model.screen, 'settings');
  model.activate('overlay:back');
  assert.equal(model.screen, 'wizard');
  assert.equal(model.focus, 'field:siteUrl');
  assert.deepEqual(model.draft, draft);
});

test('reset requires confirmation and returns to onboarding only after it succeeds', () => {
  let calls = 0;
  const model = new WizardModel({
    preferences: { ...defaultPreferences, onboardingCompleted: true },
    resetPreferences: () => {
      calls++;
      return { ...defaultPreferences };
    },
  });
  model.draft.siteUrl = 'https://example.com';
  model.activate('settings');
  model.activate('settings:reset');
  model.render(80, 24);
  assert.equal(calls, 0);
  model.activate('overlay:back');
  assert.equal(model.screen, 'settings');
  assert.equal(model.draft.siteUrl, 'https://example.com');
  model.activate('settings:reset');
  model.activate('reset:confirm');
  assert.equal(calls, 1);
  assert.equal(model.screen, 'onboarding');
  assert.equal(model.draft.siteUrl, '');
});

test('Open UI presents progress and ready state while preserving the current draft', async () => {
  let ready!: (address: string) => void;
  const model = new WizardModel({
    preferences: { ...defaultPreferences, onboardingCompleted: true },
    openUi: () =>
      new Promise((resolve) => {
        ready = resolve;
      }),
  });
  model.activate('next');
  model.draft.siteUrl = 'https://example.com';
  model.activate('open-ui');
  assert.ok(model.render(80, 24).canvas.lines(1).join('\n').includes('Opening UI'));
  ready('http://127.0.0.1:4400');
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(model.render(80, 24).canvas.lines(1).join('\n').includes('UI Open'));
  model.activate('overlay:back');
  assert.equal(model.draft.step, 1);
  assert.equal(model.draft.siteUrl, 'https://example.com');
});

test('toggling a pending companion off and on ignores the old completion and keeps the new launch status', async () => {
  const launches: Array<(address: string) => void> = [];
  const model = new WizardModel({
    preferences: { ...defaultPreferences, onboardingCompleted: true },
    openUi: () =>
      new Promise((resolve) => {
        launches.push(resolve);
      }),
  });
  model.activate('setting:launchUi');
  assert.equal(model.preferences.launchUi, true);
  assert.equal(model.uiOpening, true);
  model.activate('setting:launchUi');
  assert.equal(model.preferences.launchUi, false);
  assert.equal(model.uiOpening, false);
  assert.equal(model.uiAddress, '');
  model.activate('setting:launchUi');
  assert.equal(launches.length, 2);
  assert.equal(model.uiOpening, true);
  launches[0]('http://localhost:1234');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(model.uiOpening, true);
  assert.equal(model.uiAddress, '');
  launches[1]('http://localhost:5678');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(model.uiOpening, false);
  assert.equal(model.uiAddress, 'http://localhost:5678');
  assert.equal(model.notice, 'UI Open');
  assert.equal(model.screen, 'wizard');
});

test('disabling an already-ready companion clears its address and the UI Open header state', () => {
  const model = new WizardModel({
    preferences: { ...defaultPreferences, onboardingCompleted: true, launchUi: true },
    uiAddress: 'http://localhost:4400',
  });
  assert.ok(model.render(100, 30).canvas.lines(1).join('\n').includes('UI Open'));
  model.activate('setting:launchUi');
  assert.equal(model.preferences.launchUi, false);
  assert.equal(model.uiOpening, false);
  assert.equal(model.uiAddress, '');
  const screen = model.render(100, 30).canvas.lines(1).join('\n');
  assert.ok(screen.includes('Open UI'));
  assert.ok(!screen.includes('UI Open'));
  assert.ok(!screen.includes('http://localhost:4400'));
});

test('standard Windows terminal dimensions show the complete wordmark and branding clicks are inert', () => {
  const model = create();
  model.activate('next');
  model.draft.siteUrl = 'https://example.com';
  for (const [columns, rows] of [
    [80, 24],
    [120, 30],
  ]) {
    const layout = model.render(columns, rows);
    const lines = layout.canvas.lines(1);
    for (const line of BRAND_ART) assert.ok(lines.some((shown) => shown.includes(line)));
    const before = { ...model.draft };
    model.handle({ type: 'mouse', kind: 'click', x: 10, y: 2 });
    assert.deepEqual(model.draft, before);
    assert.equal(model.screen, 'wizard');
  }
});

test('background decoration leaves text and interactive surfaces intact', () => {
  const canvas = new TerminalCanvas(80, 24);
  canvas.text(2, 2, 'framerexport');
  canvas.fill(2, 4, 20, 3, { bg: '#1E1E1E' });
  const before = canvas.lines(24);
  canvas.decorateBackground(terminalPixelBlast(80, 24, 4));
  const after = canvas.lines(24);
  const text = canvas.lines(1);
  assert.equal(text[2].slice(2, 14), 'framerexport');
  for (const row of [4, 5, 6]) assert.equal(text[row].slice(2, 22), ' '.repeat(20));
  assert.ok(after[4].includes('48;2;30;30;30m'));
  assert.ok(after.join('').length >= before.join('').length);
});
