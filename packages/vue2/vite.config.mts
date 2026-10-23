import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue2';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'Ofdh5Vue2',
      formats: ['es', 'umd'],
      fileName: (format) => (format === 'es' ? 'ofdh5-vue2.esm.js' : 'ofdh5-vue2.umd.js'),
    },
    rollupOptions: {
      external: ['vue', '@ofdh5/core'],
      output: { globals: { vue: 'Vue', '@ofdh5/core': 'Ofdh5' }, exports: 'named' },
    },
  },
});
