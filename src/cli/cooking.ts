import chalk from 'chalk';
import { ui } from './theme.js';

const SHINE_WIDTH = 14;
const FRAME_INTERVAL = 70;
const INTRO_DURATION = 1400;
const SHINE_SPEED = 0.55;

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export async function showLoadingIntro(version: string): Promise<void> {
  if (!process.stdout.isTTY || process.env.CI) return;

  await new Promise<void>((resolve) => {
    let frame = 0;

    const draw = (): void => {
      const spinner = SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
      const title = renderShinyText(`Framer Export v${version}`, frame, {
        baseColor: '#969696',
        shineColor: '#ffffff',
        shineWidth: 18,
        speed: 1.2,
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
  options: { baseColor?: string; shineColor?: string; shineWidth?: number; speed?: number } = {}
): string {
  const baseColor = options.baseColor || '#808080';
  const shineColor = options.shineColor || '#ffffff';
  const shineWidth = options.shineWidth || SHINE_WIDTH;
  const speed = options.speed ?? SHINE_SPEED;
  const travel = text.length + shineWidth * 2;
  const pos = ((frame * speed) % travel) - shineWidth;
  const base = hexToRgb(baseColor);
  const shine = hexToRgb(shineColor);

  let result = '';
  for (let i = 0; i < text.length; i++) {
    const dist = Math.abs(i - pos);
    const intensity = smoothstep(0, 1, 1 - Math.min(1, dist / shineWidth));
    const color = mixRgb(base, shine, intensity);
    const paint =
      intensity > 0.82
        ? chalk.rgb(color.r, color.g, color.b).bold
        : chalk.rgb(color.r, color.g, color.b);
    result += paint(text[i]);
  }
  return result;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const normalized =
    clean.length === 3
      ? clean
          .split('')
          .map((char) => char + char)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function mixRgb(
  from: { r: number; g: number; b: number },
  to: { r: number; g: number; b: number },
  amount: number
): { r: number; g: number; b: number } {
  return {
    r: Math.round(from.r + (to.r - from.r) * amount),
    g: Math.round(from.g + (to.g - from.g) * amount),
    b: Math.round(from.b + (to.b - from.b) * amount),
  };
}
