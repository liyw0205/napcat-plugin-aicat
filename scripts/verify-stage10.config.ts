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
      entry: resolve(__dirname, 'verify-stage10-browser-e2e.ts'),
      formats: ['es'],
      fileName: () => 'stage10-browser-e2e.mjs',
    },
    rollupOptions: {
      external: [...nodeModules, 'undici', 'linkedom'],
    },
    outDir: resolve(__dirname, '../tmp/stage10-verify'),
    emptyDirBeforeWrite: true,
  },
});
