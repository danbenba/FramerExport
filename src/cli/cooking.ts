import chalk from 'chalk';
import { ui } from './theme.js';

const SHINE_WIDTH = 10;
const FRAME_INTERVAL = 80;

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export class CookingSpinner {
  private interval: NodeJS.Timeout | null = null;
  private frame = 0;
  private phase = '';
  private active = false;

  start(phase: string = ''): void {
    this.phase = phase;
    this.frame = 0;
    this.active = true;
    this.draw();
    this.interval = setInterval(() => {
      this.frame++;
      this.draw();
    }, FRAME_INTERVAL);
  }

  update(phase: string): void {
    this.phase = phase;
  }

  log(message: string): void {
    if (this.active) {
      process.stdout.write('\r\x1B[2K');
    }
    process.stdout.write(message + '\n');
    if (this.active) {
      this.draw();
    }
  }

  stop(): void {
    this.active = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    process.stdout.write('\r\x1B[2K');
  }

  private draw(): void {
    if (!this.active) return;

    const spinner = SPINNER_FRAMES[this.frame % SPINNER_FRAMES.length];
    const shimmer = this.renderShimmer('Exporting');
    const frameStr = ui.primary(spinner);
    const phaseStr = this.phase ? `  ${ui.muted(this.limitLen(this.phase, 52))}` : '';

    process.stdout.write(`\r\x1B[2K  ${frameStr} ${shimmer}${phaseStr}`);
  }

  private renderShimmer(text: string): string {
    let result = '';
    const pos = (this.frame % (text.length + SHINE_WIDTH * 2)) - SHINE_WIDTH;
    for (let i = 0; i < text.length; i++) {
      const dist = Math.abs(i - pos);
      if (dist < SHINE_WIDTH) {
        const t = 1 - dist / SHINE_WIDTH;
        const g = Math.floor(160 + t * 95);
        result += chalk.rgb(250, Math.min(255, g), Math.min(255, Math.floor(g * 0.75)))(text[i]);
      } else {
        result += ui.muted(text[i]);
      }
    }
    return result;
  }

  private limitLen(s: string, max: number): string {
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + '…';
  }
}
