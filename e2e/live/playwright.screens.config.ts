import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: __dirname,
  testMatch: /(ui-(screens|pieces)|detect-sample|test-tab-highlight|real-extension|branding-shots|office-fixtures)\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  reporter: [['list']],
  use: { browserName: 'chromium', headless: true },
});


