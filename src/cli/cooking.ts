import chalk from 'chalk';

const SHINE_WIDTH = 6;

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
    }, 80);
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
    const dotStr: string = chalk.rgb(100, 100, 100)(dots);
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
        const r: number = Math.floor(100 + t * 100);
        const g: number = Math.floor(100 + t * 110);
        const b: number = Math.floor(100 + t * 155);
        result += chalk.rgb(r, g, b)(text[i]);
      } else {
        result += chalk.rgb(100, 100, 100)(text[i]);
      }
    }
    return result;
  }
}
