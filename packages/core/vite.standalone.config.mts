import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// 浏览器 script 直引产物：默认导出构造函数，window.Ofdh5 可直接 new。
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/standalone.ts'),
      name: 'Ofdh5',
      formats: ['umd'],
      fileName: () => 'ofdh5.min.js',
    },
    sourcemap: true,
    // 主配置已清空过 dist，这里保留 esm / umd 产物
    emptyOutDir: false,
    rollupOptions: {
      output: {
        exports: 'default',
      },
    },
  },
});
