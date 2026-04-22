import ora, { type Ora } from 'ora';
import chalk from 'chalk';

const SHINE_WIDTH = 6;

export class CookingSpinner {
  private spinner: Ora;
  private frame = 0;
  private interval: NodeJS.Timeout | null = null;
  private phase = '';

  constructor() {
    this.spinner = ora({ spinner: { frames: [' '], interval: 80 }, color: 'yellow' });
  }

  start(phase: string = ''): void {
    this.phase = phase;
    this.frame = 0;
    this.spinner.start();
    this.renderFrame();
    this.interval = setInterval(() => {
      this.frame++;
      this.renderFrame();
    }, 80);
  }

  update(phase: string): void {
    this.phase = phase;
    this.renderFrame();
  }

  succeed(message: string): void {
    this.stop();
    console.log(`  ${chalk.green('✓')} ${chalk.green(message)}`);
  }

  fail(message: string): void {
    this.stop();
    console.log(`  ${chalk.red('✗')} ${chalk.red(message)}`);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.spinner.stop();
  }

  private renderFrame(): void {
    const base = 'Cooking';
    const dotCount: number = (this.frame % 16 < 4) ? 1 : (this.frame % 16 < 8) ? 2 : (this.frame % 16 < 12) ? 3 : 2;
    const dots: string = '.'.repeat(dotCount);
    const pad: string = ' '.repeat(3 - dotCount);
    const cookingText: string = base + dots + pad;

    const shimmer: string = this.renderShimmer(cookingText);
    const phaseText: string = this.phase ? `  ${chalk.gray(this.phase)}` : '';
    this.spinner.text = shimmer + phaseText;
  }

  private renderShimmer(text: string): string {
    let result = '';
    const shinePos: number = this.frame % (text.length + SHINE_WIDTH * 2) - SHINE_WIDTH;

    for (let i = 0; i < text.length; i++) {
      const ch: string = text[i];
      if (ch === ' ') {
        result += ' ';
        continue;
      }
      const dist: number = Math.abs(i - shinePos);
      if (dist < SHINE_WIDTH) {
        const brightness: number = 1 - dist / SHINE_WIDTH;
        const gray: number = Math.floor(130 + brightness * 125);
        result += chalk.rgb(gray, gray, gray)(ch);
      } else {
        result += chalk.rgb(130, 130, 130)(ch);
      }
    }
    return result;
  }
}
