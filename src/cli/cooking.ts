import chalk from 'chalk';
import { ui } from './theme.js';

const SHINE_WIDTH = 10;
const FRAME_INTERVAL = 80;
const INTRO_DURATION = 950;

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export async function showLoadingIntro(version: string): Promise<void> {
  if (!process.stdout.isTTY || process.env.CI) return;

  await new Promise<void>((resolve) => {
    let frame = 0;

    const draw = (): void => {
      const spinner = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
      const title = renderShinyText(`Framer Export v${version}`, frame, {
        baseColor: '#b5b5b5',
        shineColor: '#ffffff',
        shineWidth: 12,
      });
      const dots = '.'.repeat(frame % 4).padEnd(3, ' ');
      process.stdout.write(
        `\r\x1B[2K  ${ui.primary(spinner)} ${title} ${ui.muted(`Loading${dots}`)}`
      );
      frame++;
    };

    process.stdout.write('\x1B[?25l');
    draw();
    const interval = setInterval(draw, FRAME_INTERVAL);
    setTimeout(() => {
      clearInterval(interval);
      process.stdout.write('\r\x1B[2K\x1B[?25h');
      resolve();
    }, INTRO_DURATION);
  });
}

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
    const shimmer = renderShinyText('Exporting', this.frame);
    const frameStr = ui.primary(spinner);
    const phaseStr = this.phase ? `  ${ui.muted(this.limitLen(this.phase, 52))}` : '';

    process.stdout.write(`\r\x1B[2K  ${frameStr} ${shimmer}${phaseStr}`);
  }

  private limitLen(s: string, max: number): string {
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + '…';
  }
}

function renderShinyText(
  text: string,
  frame: number,
  options: { baseColor?: string; shineColor?: string; shineWidth?: number } = {}
): string {
  const baseColor = options.baseColor || '#808080';
  const shineColor = options.shineColor || '#ffffff';
  const shineWidth = options.shineWidth || SHINE_WIDTH;
  const pos = (frame % (text.length + shineWidth * 2)) - shineWidth;

  let result = '';
  for (let i = 0; i < text.length; i++) {
    const dist = Math.abs(i - pos);
    if (dist < shineWidth) {
      result += chalk.hex(shineColor).bold(text[i]);
    } else {
      result += chalk.hex(baseColor)(text[i]);
    }
  }
  return result;
}
