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
      entry: resolve(__dirname, 'verify-stage7-web-dom.ts'),
      formats: ['es'],
      fileName: () => 'stage7-web-dom.mjs',
    },
    rollupOptions: {
      external: [...nodeModules, 'linkedom', 'undici'],
    },
    outDir: resolve(__dirname, '../tmp/stage7-verify'),
    emptyDirBeforeWrite: true,
  },
});
