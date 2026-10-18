import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 1440, height: 1000 } },
  webServer: { command: 'npm run preview', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
});
