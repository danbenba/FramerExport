import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist/cli',
  clean: true,
  sourcemap: false,
  minify: true,
  esbuildOptions(options) {
    options.legalComments = 'none';
  },
  splitting: false,
  external: ['puppeteer', 'prettier', 'chalk', 'ora'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
