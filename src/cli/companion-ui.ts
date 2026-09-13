import { spawn, type ChildProcess } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';

export class CompanionUi {
  private child: ChildProcess | undefined;
  private pending: Promise<string> | undefined;
  private cancelPending: (() => void) | undefined;
  private address = '';
  constructor(private readonly spawnChild: typeof spawn = spawn) {}
  start(): Promise<string> {
    if (this.address && this.child?.exitCode === null) return Promise.resolve(this.address);
    if (this.pending) return this.pending;
    this.pending = new Promise((resolve, reject) => {
      const args = [...process.execArgv, process.argv[1], 'ui', '--port', '0'];
      if (process.env.FEXPORT_NO_BROWSER === '1') args.push('--no-open');
      const child = this.spawnChild(process.execPath, args, {
        env: { ...process.env, FEXPORT_COMPANION: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
      });
      this.child = child;
      let buffer = '',
        settled = false;
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (this.child === child) {
          this.child = undefined;
          this.address = '';
          this.pending = undefined;
          this.cancelPending = undefined;
        }
        child.stdin?.end();
        if (!child.killed) child.kill();
        reject(new Error(message));
      };
      const timer = setTimeout(
        () => fail('The browser interface did not start within 15 seconds.'),
        15000
      );
      this.cancelPending = () => fail('The browser interface stopped before it was ready.');
      child.once('error', (error) => fail(error.message));
      child.once('exit', () => {
        if (this.child === child) {
          this.child = undefined;
          this.address = '';
          this.pending = undefined;
          this.cancelPending = undefined;
        }
        fail('The browser interface stopped before it was ready.');
      });
      child.stdout?.on('data', (chunk) => {
        buffer = (buffer + stripVTControlCharacters(chunk.toString())).slice(-8192);
        const match = /http:\/\/localhost:(\d+)/.exec(buffer);
        if (match && !settled && this.child === child) {
          settled = true;
          clearTimeout(timer);
          this.address = match[0];
          this.pending = undefined;
          this.cancelPending = undefined;
          resolve(this.address);
        }
      });
      child.stderr?.on('data', () => {});
    });
    return this.pending;
  }
  stop(): void {
    const child = this.child;
    const cancel = this.cancelPending;
    this.child = undefined;
    this.address = '';
    this.pending = undefined;
    this.cancelPending = undefined;
    if (cancel) cancel();
    else if (child) {
      child.stdin?.end();
      if (!child.killed) child.kill();
    }
  }
}
