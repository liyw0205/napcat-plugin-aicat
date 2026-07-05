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
      entry: resolve(__dirname, 'verify-stage6-web-smoke.ts'),
      formats: ['es'],
      fileName: () => 'stage6-web-smoke.mjs',
    },
    rollupOptions: {
      external: [...nodeModules, 'undici'],
    },
    outDir: resolve(__dirname, '../tmp/stage6-verify'),
    emptyDirBeforeWrite: true,
  },
});
