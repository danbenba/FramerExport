import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import pty from 'node-pty';
import xterm from '@xterm/headless';

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function launch(mode = 'success') {
  fs.mkdirSync(path.resolve('tmp'), { recursive: true });
  const directory = fs.mkdtempSync(path.join(path.resolve('tmp'), 'log-viewer-'));
  const terminal = new xterm.Terminal({
    cols: 100,
    rows: 30,
    allowProposedApi: true,
    scrollback: 100,
  });
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    TERM: 'xterm-256color',
    COLORTERM: 'truecolor',
  };
  delete environment.NO_COLOR;
  const child = pty.spawn(
    process.execPath,
    ['--import', 'tsx', path.resolve('tests/fixtures/log-viewer-child.ts'), directory, mode],
    {
      name: 'xterm-256color',
      cols: 100,
      rows: 30,
      cwd: process.cwd(),
      useConptyDll: process.platform === 'win32',
      env: environment,
    }
  );
  let pending = Promise.resolve();
  let output = '';
  let exitCode: number | undefined;
  child.onData((data) => {
    output += data;
    pending = pending.then(() => new Promise<void>((resolve) => terminal.write(data, resolve)));
  });
  const response = terminal.onData((data) => child.write(data));
  child.onExit((event) => {
    exitCode = event.exitCode;
  });
  const text = () =>
    Array.from(
      { length: terminal.rows },
      (_, row) =>
        terminal.buffer.active
          .getLine(terminal.buffer.active.viewportY + row)
          ?.translateToString(true) || ''
    ).join('\n');
  const waitFor = async (check: () => boolean, label: string) => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      await pending;
      if (check()) return;
      await delay(30);
    }
    throw new Error(`Timed out waiting for ${label}\n${text()}\n${output.slice(-1000)}`);
  };
  const stop = async () => {
    if (exitCode === undefined) child.write('\x03');
    fs.writeFileSync(path.join(directory, 'continue'), 'continue');
    for (let index = 0; index < 30 && exitCode === undefined; index++) await delay(30);
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
    fs.writeFileSync(path.join(directory, 'terminal.ansi'), output);
    fs.writeFileSync(path.join(directory, 'screen.txt'), text());
    response.dispose();
    terminal.dispose();
  };
  return {
    directory,
    child,
    terminal,
    text,
    waitFor,
    stop,
    exitCode: () => exitCode,
    output: () => output,
    finish: () => fs.writeFileSync(path.join(directory, 'continue'), 'continue'),
    async append(prefix: string, count: number) {
      const id = `${Date.now()}-${prefix}`;
      const temporary = path.join(directory, 'append.next.json');
      fs.writeFileSync(temporary, JSON.stringify({ id, prefix, count }));
      fs.renameSync(temporary, path.join(directory, 'append.json'));
      await waitFor(
        () =>
          fs.existsSync(path.join(directory, 'appended')) &&
          fs.readFileSync(path.join(directory, 'appended'), 'utf8') === id,
        'appended log batch'
      );
    },
    async resize(columns: number, rows: number) {
      terminal.resize(columns, rows);
      child.resize(columns, rows);
      await delay(200);
      await pending;
    },
  };
}

test(
  'real log viewer supports search, filters, scrolling, resizing and completed close',
  { timeout: 60000 },
  async (t) => {
    const viewer = await launch();
    t.after(() => viewer.stop());
    await viewer.waitFor(() => viewer.text().includes('Fixture is waiting'), 'running logs');
    assert.equal(viewer.terminal.buffer.active.type, 'alternate');
    viewer.child.write('/marker\r');
    await viewer.waitFor(() => viewer.text().includes('2 of 2'), 'search matches');
    viewer.child.write('ff');
    await viewer.waitFor(
      () => viewer.text().includes('Filter: errors') && viewer.text().includes('1 of 1'),
      'error-only filter'
    );
    assert.ok(viewer.text().includes('Missing font marker'));
    assert.ok(!viewer.text().includes('Retry marker'));
    viewer.child.write('/\x15\rf\x1b[H');
    await viewer.waitFor(
      () => viewer.text().includes('Downloaded asset 1 café'),
      'scroll to beginning'
    );
    for (const [columns, rows] of [
      [20, 6],
      [40, 12],
      [80, 24],
      [120, 40],
    ]) {
      await viewer.resize(columns, rows);
      assert.equal(viewer.terminal.buffer.active.type, 'alternate');
      assert.equal(viewer.terminal.buffer.active.baseY, 0);
      assert.ok(viewer.text().trim());
    }
    viewer.child.write('\x1b[F');
    viewer.finish();
    await viewer.waitFor(() => viewer.text().includes('COMPLETE'), 'completed view');
    assert.equal(viewer.exitCode(), undefined);
    viewer.child.write('\r');
    await viewer.waitFor(() => viewer.exitCode() !== undefined, 'completed process exit');
    assert.equal(viewer.exitCode(), 0);
    assert.equal(viewer.terminal.buffer.active.type, 'normal');
    assert.ok(viewer.output().includes('VIEWER_RESULT=73'));
    const saved = fs.readFileSync(path.join(viewer.directory, 'export.log'), 'utf8');
    assert.ok(saved.includes('Downloaded asset 1 café 界 👩🏽‍💻'));
    assert.ok(saved.includes('[warn] Retry marker'));
    assert.ok(saved.includes('[error] Missing font marker'));
  }
);

test(
  'live logs follow new batches, preserve an explicitly scrolled position and resume by mouse',
  { timeout: 60000 },
  async (t) => {
    const viewer = await launch();
    t.after(() => viewer.stop());
    await viewer.waitFor(() => viewer.text().includes('Fixture is waiting'), 'initial live logs');
    await viewer.append('First batch', 60);
    await viewer.waitFor(() => viewer.text().includes('First batch 60'), 'automatic follow');
    assert.ok(viewer.text().includes('Following'));
    viewer.child.write('\x1b[<64;20;12M');
    await viewer.waitFor(() => viewer.text().includes('Latest logs'), 'paused follow');
    const body = viewer
      .text()
      .split('\n')
      .slice(7, -4)
      .map((line) => line.slice(0, -1));
    await viewer.append('Second batch', 70);
    await viewer.waitFor(() => viewer.text().includes('173 total'), 'paused batch count');
    assert.deepEqual(
      viewer
        .text()
        .split('\n')
        .slice(7, -4)
        .map((line) => line.slice(0, -1)),
      body
    );
    assert.ok(!viewer.text().includes('Second batch 70'));
    const screen = viewer.text().split('\n');
    const row = screen.findIndex((line) => line.includes('Latest logs'));
    const column = screen[row].indexOf('Latest logs') + 1;
    viewer.child.write(`\x1b[<0;${column};${row + 1}M\x1b[<0;${column};${row + 1}m`);
    await viewer.waitFor(
      () => viewer.text().includes('Following') && viewer.text().includes('Second batch 70'),
      'mouse resume'
    );
    assert.equal(viewer.terminal.buffer.active.baseY, 0);
    viewer.finish();
    await viewer.waitFor(() => viewer.text().includes('COMPLETE'), 'completed follow');
    viewer.child.write('\r');
    await viewer.waitFor(() => viewer.exitCode() === 0, 'finished follow process');
  }
);

test(
  'reduced-motion logs stay idle without terminal writes and ignore movement over empty space',
  { timeout: 60000 },
  async (t) => {
    const viewer = await launch();
    t.after(() => viewer.stop());
    await viewer.waitFor(() => viewer.text().includes('Fixture is waiting'), 'idle live logs');
    await delay(250);
    const baseline = viewer.output();
    await delay(3600);
    assert.equal(viewer.output(), baseline);
    viewer.child.write('\x1b[<35;15;12M\x1b[<35;17;13M\x1b[<35;19;14M');
    await delay(250);
    assert.equal(viewer.output(), baseline);
    viewer.finish();
    await viewer.waitFor(() => viewer.text().includes('COMPLETE'), 'idle completed logs');
    await delay(200);
    const complete = viewer.output();
    await delay(300);
    assert.equal(viewer.output(), complete);
    viewer.child.write('\r');
    await viewer.waitFor(() => viewer.exitCode() === 0, 'idle process exit');
  }
);

test(
  'enabled shine repaints the phase without redrawing records or clearing the terminal',
  { timeout: 60000 },
  async (t) => {
    const viewer = await launch('animated');
    t.after(() => viewer.stop());
    await viewer.waitFor(() => viewer.text().includes('Fixture is waiting'), 'animated logs');
    await delay(200);
    const offset = viewer.output().length;
    const before = viewer.text();
    await delay(2300);
    const animation = viewer.output().slice(offset);
    assert.ok(animation.length > 0);
    assert.ok(animation.length < 30000, `Unexpected animation output: ${animation.length} bytes`);
    assert.doesNotMatch(animation, /Downloaded asset|Retry marker|Missing font|Fixture is waiting/);
    assert.doesNotMatch(animation, /\x1b\[(?:2J|3J|\?1049h)/);
    assert.equal(viewer.text(), before);
    const positionedRows = [...animation.matchAll(/\x1b\[(\d+);\d+H/g)].map((match) =>
      Number(match[1])
    );
    assert.ok(positionedRows.every((row) => row === 2));
    viewer.finish();
    await viewer.waitFor(() => viewer.text().includes('COMPLETE'), 'finished animated logs');
    await delay(250);
    const complete = viewer.output();
    await delay(300);
    assert.equal(viewer.output(), complete);
    viewer.child.write('\r');
    await viewer.waitFor(() => viewer.exitCode() === 0, 'animated process exit');
  }
);

test(
  'Ctrl+C detaches the running viewer and still awaits the actual operation result',
  { timeout: 60000 },
  async (t) => {
    const viewer = await launch();
    t.after(() => viewer.stop());
    await viewer.waitFor(() => viewer.text().includes('Fixture is waiting'), 'running logs');
    viewer.child.write('\x03');
    await viewer.waitFor(
      () => viewer.text().includes('Export continues in the console'),
      'detached console'
    );
    assert.equal(viewer.terminal.buffer.active.type, 'normal');
    assert.equal(viewer.exitCode(), undefined);
    assert.ok(!viewer.output().includes('VIEWER_RESULT='));
    assert.equal(fs.existsSync(path.join(viewer.directory, 'export.log')), false);
    viewer.finish();
    await viewer.waitFor(() => viewer.exitCode() !== undefined, 'settled detached operation');
    assert.equal(viewer.exitCode(), 0);
    assert.ok(viewer.output().includes('VIEWER_RESULT=73'));
    assert.ok(viewer.output().includes('Operation actually settled'));
    assert.ok(
      fs
        .readFileSync(path.join(viewer.directory, 'export.log'), 'utf8')
        .includes('Operation actually settled')
    );
  }
);

test(
  'failed operation remains inspectable and propagates its original rejection after close',
  { timeout: 60000 },
  async (t) => {
    const viewer = await launch('failure');
    t.after(() => viewer.stop());
    await viewer.waitFor(() => viewer.text().includes('Fixture is waiting'), 'running logs');
    viewer.finish();
    await viewer.waitFor(
      () => viewer.text().includes('FAILED') && viewer.text().includes('Fixture export rejected'),
      'failed view'
    );
    assert.equal(viewer.exitCode(), undefined);
    viewer.child.write('\r');
    await viewer.waitFor(() => viewer.exitCode() !== undefined, 'failed process exit');
    assert.equal(viewer.exitCode(), 7);
    assert.equal(viewer.terminal.buffer.active.type, 'normal');
    assert.ok(viewer.output().includes('VIEWER_FAILURE=Fixture export rejected'));
    assert.ok(!viewer.output().includes('VIEWER_RESULT='));
  }
);
