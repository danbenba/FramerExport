import pkg from '../../package.json';
import { ui } from './theme.js';
import { fitText } from './terminal-screen.js';
import chalk from 'chalk';

const glyphs: Record<string, string[]> = {
  f: ['00110', '01000', '11100', '01000', '01000', '01000', '01000', '00000'],
  r: ['00000', '00000', '10110', '11001', '10000', '10000', '10000', '00000'],
  a: ['00000', '00000', '01110', '00001', '01111', '10001', '01111', '00000'],
  m: ['00000', '00000', '11010', '10101', '10101', '10101', '10101', '00000'],
  e: ['00000', '00000', '01110', '10001', '11111', '10000', '01110', '00000'],
  x: ['00000', '00000', '10001', '01010', '00100', '01010', '10001', '00000'],
  p: ['00000', '00000', '11110', '10001', '11110', '10000', '10000', '10000'],
  o: ['00000', '00000', '01110', '10001', '10001', '10001', '01110', '00000'],
  t: ['01000', '01000', '11100', '01000', '01000', '01001', '00110', '00000'],
};
export const BRAND_COLOR = '#707070';
export const BRAND_SPLIT = 36;
export const BRAND_ART = Array.from({ length: 4 }, (_, row) =>
  [...'framerexport']
    .map((letter) =>
      Array.from({ length: 5 }, (_, col) => {
        const top = glyphs[letter][row * 2][col] === '1';
        const bottom = glyphs[letter][row * 2 + 1][col] === '1';
        return top ? (bottom ? '█' : '▀') : bottom ? '▄' : ' ';
      }).join('')
    )
    .join(' ')
);

export function showBanner(): void {
  const width = Math.max(1, (process.stdout.columns || 80) - 2);
  const lines =
    width >= 71
      ? [...BRAND_ART, 'framerexport · v' + pkg.version]
      : ['framerexport', 'v' + pkg.version];
  console.log('');
  lines.forEach((line, index) =>
    console.log(
      ' ' +
        (width >= 71 && index < BRAND_ART.length
          ? chalk.hex(BRAND_COLOR)(line.slice(0, BRAND_SPLIT)) + ui.text(line.slice(BRAND_SPLIT))
          : index === 0
            ? chalk.hex(BRAND_COLOR)('framer') + ui.text('export')
            : ui.muted(fitText(line, width)))
    )
  );
  console.log('');
}
