import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  external: ['puppeteer', 'prettier', 'chalk', 'ora'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
