import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'Ofdh5',
      formats: ['es', 'umd'],
      fileName: (format) => (format === 'es' ? 'ofdh5.esm.js' : 'ofdh5.umd.js'),
    },
    sourcemap: true,
    emptyOutDir: true,
  },
});
