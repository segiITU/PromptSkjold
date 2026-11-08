import { defineConfig } from '@playwright/test';

/** Opt-in run of the OCR end-to-end check; see ocr-attachments.spec.ts. */
export default defineConfig({
  testDir: __dirname,
  testMatch: /(?:ocr-attachments|attach-flow|overlay-screenshots).spec.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  reporter: [['list']],
  use: { browserName: 'chromium', headless: true, trace: 'off' },
});
