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
      entry: resolve(__dirname, 'verify-stage8-napcat-lifecycle.ts'),
      formats: ['es'],
      fileName: () => 'stage8-napcat-lifecycle.mjs',
    },
    rollupOptions: {
      external: [...nodeModules, 'undici', 'linkedom'],
    },
    outDir: resolve(__dirname, '../tmp/stage8-verify'),
    emptyDirBeforeWrite: true,
  },
});
