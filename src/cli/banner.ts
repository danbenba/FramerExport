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
const compactGlyphs: Record<string, string[]> = {
  f: ['011', '010', '111', '010', '010', '010', '010', '000'],
  r: ['000', '000', '101', '110', '100', '100', '100', '000'],
  a: ['000', '000', '110', '001', '111', '101', '111', '000'],
  m: ['000', '000', '111', '111', '111', '101', '101', '000'],
  e: ['000', '000', '010', '101', '111', '100', '011', '000'],
  x: ['000', '000', '101', '101', '010', '101', '101', '000'],
  p: ['000', '000', '110', '101', '110', '100', '100', '100'],
  o: ['000', '000', '010', '101', '101', '101', '010', '000'],
  t: ['010', '010', '111', '010', '010', '010', '011', '000'],
};
export function terminalBrand(width: number): { lines: string[]; split: number } {
  if (width >= 95) return { lines: BRAND_ART, split: BRAND_SPLIT };
  return {
    lines: Array.from({ length: 4 }, (_, row) =>
      [...'framerexport']
        .map((letter) =>
          Array.from({ length: 3 }, (_, col) => {
            const top = compactGlyphs[letter][row * 2][col] === '1';
            const bottom = compactGlyphs[letter][row * 2 + 1][col] === '1';
            return top ? (bottom ? '█' : '▀') : bottom ? '▄' : ' ';
          }).join('')
        )
        .join(' ')
    ),
    split: 24,
  };
}

export function showBanner(): void {
  const width = Math.max(1, (process.stdout.columns || 80) - 2);
  const prerelease = pkg.version.includes('-');
  const version = 'v' + pkg.version;
  const badge = chalk.bgHex('#FAB283').hex('#0A0A0A').bold(' Beta ');
  console.log('');
  if (width >= 71) {
    const brand = terminalBrand(width);
    brand.lines.forEach((line, index) =>
      console.log(
        ' ' +
          chalk.hex(BRAND_COLOR)(line.slice(0, brand.split)) +
          ui.text(line.slice(brand.split)) +
          (index === 1 && prerelease ? '  ' + badge : index === 2 ? '  ' + ui.muted(version) : '')
      )
    );
  } else {
    const name =
      chalk.hex(BRAND_COLOR)(fitText('framer', Math.min(6, width))) +
      (width > 6 ? ui.text(fitText('export', Math.min(6, width - 6))) : '');
    const sameLine = width >= 14 + (prerelease ? 7 : 0) + version.length;
    console.log(
      ' ' + name + (sameLine ? '  ' + (prerelease ? badge + ' ' : '') + ui.muted(version) : '')
    );
    if (!sameLine)
      console.log(' ' + ui.muted(fitText((prerelease ? 'Beta ' : '') + version, width)));
  }
  console.log('');
}
