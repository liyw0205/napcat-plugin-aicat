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
      entry: resolve(__dirname, 'verify-stage9-provider-contracts.ts'),
      formats: ['es'],
      fileName: () => 'stage9-provider-contracts.mjs',
    },
    rollupOptions: {
      external: [...nodeModules, 'undici', 'linkedom'],
    },
    outDir: resolve(__dirname, '../tmp/stage9-verify'),
    emptyDirBeforeWrite: true,
  },
});
