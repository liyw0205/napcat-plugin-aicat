import { resolve } from 'path';
import { builtinModules } from 'module';
import { defineConfig } from 'vite';

const nodeModules = [...builtinModules, builtinModules.map(m => `node:${m}`)].flat();

export default defineConfig({
  build: {
    target: 'node18',
    minify: false,
    sourcemap: false,
    lib: {
      entry: resolve(__dirname, 'verify-stage12-unit-foundation.ts'),
      formats: ['es'],
      fileName: () => 'stage12-unit-foundation.mjs',
    },
    rollupOptions: {
      external: [...nodeModules, 'undici', 'linkedom'],
    },
    outDir: resolve(__dirname, '../tmp/stage12-verify'),
    emptyDirBeforeWrite: true,
  },
});
