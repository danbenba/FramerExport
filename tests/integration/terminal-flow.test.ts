import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import pty from 'node-pty';
import xterm from '@xterm/headless';
import { readDraft, readPreferences, savePreferences } from '../../src/cli/preferences.js';

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function terminalText(terminal: InstanceType<typeof xterm.Terminal>): string {
  return Array.from(
    { length: terminal.rows },
    (_, row) =>
      terminal.buffer.active
        .getLine(terminal.buffer.active.viewportY + row)
        ?.translateToString(true)
        .trimEnd() ?? ''
  ).join('\n');
}

async function launch(home: string, artifact: string, columns = 100, rows = 30) {
  const terminal = new xterm.Terminal({
    cols: columns,
    rows,
    allowProposedApi: true,
    scrollback: 100,
  });
  const environment = {
    ...process.env,
    FEXPORT_HOME: home,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
    FORCE_COLOR: '3',
    FEXPORT_NO_BROWSER: '1',
  };
  delete environment.NO_COLOR;
  const child = pty.spawn(
    process.execPath,
    ['--import', 'tsx', path.resolve('src/cli/index.ts'), '--setup'],
    {
      name: 'xterm-256color',
      cols: columns,
      rows,
      cwd: process.cwd(),
      useConptyDll: process.platform === 'win32',
      env: environment,
    }
  );
  let output = '';
  let exited = false;
  let exitCode: number | undefined;
  let pending = Promise.resolve();
  child.onData((data) => {
    output += data;
    pending = pending.then(() => new Promise<void>((resolve) => terminal.write(data, resolve)));
  });
  const response = terminal.onData((data) => child.write(data));
  child.onExit((event) => {
    exited = true;
    exitCode = event.exitCode;
  });
  const waitFor = async (check: (text: string) => boolean, label: string, timeout = 15_000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      await pending;
      const text = terminalText(terminal);
      if (check(text)) return text;
      if (exited)
        throw new Error(
          `Terminal exited (${exitCode}) while waiting for ${label}\n${text}\n${output.slice(-2000)}`
        );
      await delay(40);
    }
    fs.writeFileSync(path.join(artifact, 'failure.txt'), `${label}\n${terminalText(terminal)}`);
    process.stderr.write(`Terminal test failed: ${label}\n${terminalText(terminal)}\n`);
    throw new Error(
      `Timed out waiting for ${label}\n${terminalText(terminal)}\n${output.slice(-1000)}`
    );
  };
  const clickText = async (label: string, last = false) => {
    await waitFor((text) => text.includes(label), `click target ${label}`);
    await pending;
    const lines = terminalText(terminal).split('\n');
    const matching = lines
      .map((line, row) => ({ row, column: line.indexOf(label) }))
      .filter((item) => item.column !== -1);
    const match = last ? matching.at(-1) : matching[0];
    assert.ok(match, `Missing clickable text ${label}\n${lines.join('\n')}`);
    const x = match.column + 2,
      y = match.row + 1;
    child.write(`\x1b[<0;${x};${y}M\x1b[<0;${x};${y}m`);
  };
  const stop = async () => {
    if (!exited) child.write('\x03');
    for (let i = 0; i < 50 && !exited; i++) await delay(40);
    try {
      child.kill();
    } catch {}
    const windowsSession = child as typeof child & {
      _agent?: {
        _conoutSocketWorker?: { dispose(): void };
        inSocket?: { destroy(): void };
        outSocket?: { destroy(): void };
      };
    };
    windowsSession._agent?._conoutSocketWorker?.dispose();
    windowsSession._agent?.inSocket?.destroy();
    windowsSession._agent?.outSocket?.destroy();
    await pending;
    fs.writeFileSync(path.join(artifact, 'terminal.ansi'), output);
    fs.writeFileSync(path.join(artifact, 'screen.txt'), terminalText(terminal));
    response.dispose();
    terminal.dispose();
  };
  return {
    child,
    terminal,
    waitFor,
    clickText,
    stop,
    paste: (text: string) => child.write('\x1b[200~' + text + '\x1b[201~'),
    text: () => terminalText(terminal),
    exited: () => exited,
    exitCode: () => exitCode,
    async resize(cols: number, rowCount: number) {
      terminal.resize(cols, rowCount);
      child.resize(cols, rowCount);
      await delay(200);
      await pending;
    },
  };
}

test(
  'real terminal onboarding, provider search, options, back links, resizing and draft resume work end to end',
  { timeout: 90_000 },
  async (t) => {
    const artifact = fs.mkdtempSync(path.join(path.resolve('tmp'), 'terminal-flow-'));
    const home = path.join(artifact, 'home');
    savePreferences({ checkUpdates: false, launchUi: false, reduceMotion: true }, { home });
    const firstArtifact = path.join(artifact, 'first');
    fs.mkdirSync(firstArtifact);
    const first = await launch(home, firstArtifact);
    t.after(() => first.stop());
    await first.waitFor((text) => text.includes('Welcome'), 'first-launch onboarding');
    first.child.write('\r');
    await first.waitFor(
      (text) => text.includes('Cards') && text.includes('List'),
      'provider chooser'
    );
    assert.equal(readPreferences({ home }).onboardingCompleted, true);
    const settingsLine = first
      .text()
      .split('\n')
      .findIndex((line) => line.includes('Settings'));
    const settingsColumn = first.text().split('\n')[settingsLine].indexOf('Settings');
    first.child.write(`\x1b[<35;${settingsColumn + 2};${settingsLine + 1}M`);
    await first.waitFor(
      (text) => text.includes('Defaults, appearance'),
      'settings hover tooltip without pressing'
    );
    await first.clickText('Settings');
    await first.waitFor((text) => text.includes('Saved automatically'), 'settings modal');
    first.child.write('?');
    await first.waitFor((text) => text.includes('Keyboard & mouse'), 'nested help modal');
    first.child.write('\x1b');
    await first.waitFor((text) => text.includes('Saved automatically'), 'return to settings');
    first.child.write('\x1b');
    await first.waitFor(
      (text) => text.includes('Cards') && text.includes('List'),
      'close modal returns to provider'
    );
    first.paste('framer');
    await first.waitFor((text) => /1 providers?/.test(text), 'filtered provider');
    first.child.write('\r');
    await first.waitFor((text) => text.includes('Public website URL'), 'site details');
    first.paste('https://example.com/terminal-test');
    await first.waitFor(
      (text) => text.includes('https://example.com/terminal-test'),
      'pasted site URL'
    );
    first.child.write('\r');
    first.paste('./terminal QA export');
    await first.waitFor((text) => text.includes('./terminal QA export'), 'output directory');
    first.child.write('\r');
    await first.waitFor((text) => text.includes('Format JavaScript'), 'export options');
    first.child.write(' \x1b[B ');
    await first.waitFor(
      (text) => text.includes('[ ] Format JavaScript') && text.includes('[✓] Include sub-pages'),
      'changed options'
    );
    await first.clickText('Next →', true);
    await first.waitFor(
      (text) => text.includes('Start export') && text.includes('Entry page only') === false,
      'review'
    );
    const review = readDraft({ home });
    assert.equal(review?.provider, 'framer');
    assert.equal(review?.siteUrl, 'https://example.com/terminal-test');
    assert.equal(review?.outDir, './terminal QA export');
    assert.equal(review?.prettyPrint, false);
    assert.equal(review?.includeSubpages, true);
    assert.equal(review?.step, 3);
    await first.clickText('Select provider');
    await first.waitFor(
      (text) => text.includes('Cards') && text.includes('List'),
      'previous step clicked'
    );
    await first.clickText('Next →', true);
    await first.waitFor(
      (text) =>
        text.includes('Public website URL') && text.includes('https://example.com/terminal-test'),
      'retained details'
    );
    for (const [cols, rows] of [
      [20, 6],
      [40, 12],
      [80, 24],
      [120, 40],
    ]) {
      await first.resize(cols, rows);
      assert.equal(first.terminal.cols, cols);
      assert.equal(first.terminal.rows, rows);
      assert.equal(first.terminal.buffer.active.type, 'alternate');
      assert.equal(first.terminal.buffer.active.baseY, 0);
      assert.ok(first.text().trim().length > 0, `${cols}x${rows} is blank`);
    }
    await first.resize(100, 30);
    await first.waitFor(
      (text) => text.includes('https://example.com/terminal-test'),
      'full layout after resize'
    );
    first.child.write('\x03');
    for (let i = 0; i < 100 && !first.exited(); i++) await delay(40);
    assert.equal(first.exited(), true);
    assert.equal(first.exitCode(), 0);
    assert.equal(readDraft({ home })?.siteUrl, review?.siteUrl);
    assert.equal(fs.existsSync(path.join(home, 'update-cache.json')), false);
    const secondArtifact = path.join(artifact, 'resumed');
    fs.mkdirSync(secondArtifact);
    const second = await launch(home, secondArtifact);
    t.after(() => second.stop());
    await second.waitFor(
      (text) => text.includes('Draft restored') && text.includes('Public website URL'),
      'resumed draft'
    );
    assert.equal(second.text().includes('Welcome'), false);
    assert.ok(second.text().includes('https://example.com/terminal-test'));
    assert.ok(second.text().includes('./terminal QA export'));
    await second.clickText('Next →', true);
    await second.waitFor(
      (text) => text.includes('[ ] Format JavaScript') && text.includes('[✓] Include sub-pages'),
      'restored options'
    );
    await second.clickText('Settings');
    await second.waitFor(
      (text) => text.includes('Settings') && text.includes('Default provider'),
      'settings overlay'
    );
    await second.resize(40, 12);
    second.child.write('\x1b[<65;20;6M'.repeat(20));
    await second.waitFor(
      (text) => text.includes('folders are kept'),
      'mouse-wheel scrolling through settings'
    );
    second.child.write('\x1b');
    await second.resize(100, 30);
    await second.waitFor(
      (text) => text.includes('Format JavaScript') && text.includes('Next →'),
      'return from settings'
    );
    fs.writeFileSync(
      path.join(artifact, 'report.json'),
      JSON.stringify(
        {
          passed: true,
          home,
          viewports: [
            [20, 6],
            [40, 12],
            [80, 24],
            [120, 40],
          ],
          draft: readDraft({ home }),
        },
        null,
        2
      )
    );
    t.diagnostic(`Terminal flow artifacts: ${artifact}`);
  }
);

test(
  'a browser companion enabled in settings starts with the terminal and stops when it exits',
  { timeout: 35_000 },
  async (t) => {
    const artifact = fs.mkdtempSync(path.join(path.resolve('tmp'), 'terminal-companion-'));
    const home = path.join(artifact, 'home');
    savePreferences(
      { checkUpdates: false, launchUi: true, onboardingCompleted: true, reduceMotion: true },
      { home }
    );
    const session = await launch(home, artifact);
    t.after(() => session.stop());
    const screen = await session.waitFor(
      (text) => /UI: http:\/\/localhost:\d+/.test(text),
      'browser companion address'
    );
    const address = /http:\/\/localhost:\d+/.exec(screen)![0];
    const response = await fetch(address, {
      signal: AbortSignal.timeout(3000),
      headers: { Connection: 'close' },
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Framer Export/);
    assert.ok(session.text().includes('Select provider'));
    session.child.write('\x03');
    for (let i = 0; i < 100 && !session.exited(); i++) await delay(40);
    assert.equal(session.exited(), true);
    assert.equal(session.exitCode(), 0);
    let closed = false;
    for (let i = 0; i < 30 && !closed; i++) {
      try {
        await fetch(address, {
          signal: AbortSignal.timeout(500),
          headers: { Connection: 'close' },
        });
      } catch {
        closed = true;
      }
      if (!closed) await delay(100);
    }
    assert.equal(
      closed,
      true,
      'The companion HTTP server remained running after the terminal exited'
    );
    fs.writeFileSync(
      path.join(artifact, 'report.json'),
      JSON.stringify({ passed: true, address, stoppedWithTerminal: closed }, null, 2)
    );
    t.diagnostic(`Terminal companion artifacts: ${artifact}`);
  }
);
