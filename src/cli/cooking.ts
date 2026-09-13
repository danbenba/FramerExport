import { ui } from './theme.js';
import { readPreferences } from './preferences.js';
import { fitText } from './terminal-screen.js';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
export class CookingSpinner {
  private interval: NodeJS.Timeout | null = null;
  private frame = 0;
  private phase = '';
  private active = false;
  start(phase = ''): void {
    this.stop();
    this.phase = phase;
    this.active = !!process.stdout.isTTY;
    if (!this.active) return;
    this.draw();
    if (!readPreferences().reduceMotion)
      this.interval = setInterval(() => {
        this.frame++;
        this.draw();
      }, 100);
  }
  update(phase: string): void {
    this.phase = phase;
    this.draw();
  }
  log(message: string): void {
    if (this.active) process.stdout.write('\r\x1b[2K');
    process.stdout.write(message + '\n');
    this.draw();
  }
  stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    if (this.active) process.stdout.write('\r\x1b[2K');
    this.active = false;
  }
  private draw(): void {
    if (!this.active) return;
    const text = `${this.interval ? FRAMES[this.frame % FRAMES.length] : '·'} Exporting  ${this.phase}`;
    process.stdout.write(
      '\r\x1b[2K' + ui.primary(fitText(text, Math.max(1, (process.stdout.columns || 80) - 1)))
    );
  }
}
