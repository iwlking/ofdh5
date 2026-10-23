import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:5180',
    headless: true,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  },
  webServer: {
    command: 'npx vite --port 5180 --strictPort',
    url: 'http://127.0.0.1:5180',
    reuseExistingServer: true,
    timeout: 60000,
  },
});
