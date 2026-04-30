import chalk from 'chalk';

const SHINE_WIDTH = 10;
const FRAME_INTERVAL = 140;

const DOT_PHASES = ['   ', '.  ', '.. ', '...', ' ..', '  .', '   '];

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

    const dots = DOT_PHASES[this.frame % DOT_PHASES.length];
    const shimmer = this.renderShimmer('Cooking');
    const dotStr = chalk.hex('#D4A017')(dots);
    const phaseStr = this.phase
      ? `  ${chalk.gray(this.limitLen(this.phase, 38))}`
      : '';

    process.stdout.write(`\r\x1B[2K  ${shimmer} ${dotStr}${phaseStr}`);
  }

  private renderShimmer(text: string): string {
    let result = '';
    const pos = this.frame % (text.length + SHINE_WIDTH * 2) - SHINE_WIDTH;
    for (let i = 0; i < text.length; i++) {
      const dist = Math.abs(i - pos);
      if (dist < SHINE_WIDTH) {
        const t = 1 - dist / SHINE_WIDTH;
        const g = Math.floor(160 + t * 95);
        result += chalk.rgb(g, g, g)(text[i]);
      } else {
        result += chalk.rgb(160, 160, 160)(text[i]);
      }
    }
    return result;
  }

  private limitLen(s: string, max: number): string {
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + '…';
  }
}
