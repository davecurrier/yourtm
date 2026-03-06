import { defineConfig } from 'tsup';

export default defineConfig([
  // ESM build for modern bundlers
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
    sourcemap: true,
    minify: true,
    treeshake: true,
    target: 'es2020',
    outDir: 'dist',
    splitting: false,
  },
  // CommonJS build for Node.js
  {
    entry: ['src/index.ts'],
    format: ['cjs'],
    outDir: 'dist',
    minify: true,
    treeshake: true,
    target: 'es2020',
    splitting: false,
  },
  // IIFE build for direct browser script tag
  {
    entry: ['src/index.ts'],
    format: ['iife'],
    globalName: 'YourTMRuntime',
    outDir: 'dist',
    outExtension: () => ({ js: '.global.js' }),
    minify: true,
    treeshake: true,
    target: 'es2020',
    splitting: false,
  },
]);
