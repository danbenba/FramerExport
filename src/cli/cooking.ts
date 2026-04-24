import chalk from 'chalk';

const SHINE_WIDTH = 8;

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
    }, 70);
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
    const text = 'Cooking';
    const dotCount: number = 1 + (this.frame % 3);
    const dots: string = '.'.repeat(dotCount);
    const pad: string = ' '.repeat(3 - dotCount);
    const shimmer: string = this.renderShimmer(text);
    const dotStr: string = chalk.rgb(180, 180, 180)(dots);
    const phaseText: string = this.phase ? `  ${chalk.gray(this.phase)}` : '';
    process.stdout.write(`\r\x1B[2K  ${shimmer}${dotStr}${pad}${phaseText}`);
  }

  private renderShimmer(text: string): string {
    let result = '';
    const pos: number = this.frame % (text.length + SHINE_WIDTH * 2) - SHINE_WIDTH;
    for (let i = 0; i < text.length; i++) {
      const dist: number = Math.abs(i - pos);
      if (dist < SHINE_WIDTH) {
        const t: number = 1 - dist / SHINE_WIDTH;
        const gray: number = Math.floor(180 + t * 75);
        result += chalk.rgb(gray, gray, gray)(text[i]);
      } else {
        result += chalk.rgb(180, 180, 180)(text[i]);
      }
    }
    return result;
  }
}
