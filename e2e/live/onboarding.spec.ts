import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { chromium, expect, test, type BrowserContext } from '@playwright/test';

/**
 * Real-Chromium check of the welcome guide: it opens by itself after a fresh
 * install, shows three slides with animations, and its settings controls write
 * the real settings. This test launches its own profile (the shared harness
 * closes the guide on purpose).
 */

let context: BrowserContext;
let profileDir: string;
let extensionId: string;

test.beforeAll(async () => {
  profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-onboarding-'));
  const build = path.resolve('dist');
  context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1100, height: 800 },
    locale: 'en-US',
    args: [`--disable-extensions-except=${build}`, `--load-extension=${build}`],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 20_000 }));
  extensionId = /^chrome-extension:\/\/([^/]+)\//.exec(worker.url())![1];
});

test.afterAll(async () => {
  await context.close();
  fs.rmSync(profileDir, { recursive: true, force: true });
});

test('the guide opens by itself after a fresh install, in Danish', async () => {
  const url = `chrome-extension://${extensionId}/onboarding/onboarding.html`;
  const existing = context.pages().find((page) => page.url() === url);
  const page = existing ?? (await context.waitForEvent('page', { timeout: 10_000 }));
  await page.waitForLoadState('domcontentloaded');
  expect(page.url()).toBe(url);
  await expect(page.getByRole('heading', { name: 'Sådan beskytter PromptSkjold dig' })).toBeVisible();
  await expect(page.getByRole('img', { name: /121212-1212/ })).toBeVisible(); // the looping demo
});

test('three slides: how it works, sites, setup; language switch and Done', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/onboarding/onboarding.html`);

  await expect(page.getByRole('heading', { name: 'Sådan beskytter PromptSkjold dig' })).toBeVisible();
  await expect(page.getByText(/scannede PDF/).first()).toBeVisible(); // images and scans are named from the start
  await expect(page.getByText(/ikke en garanti/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Næste' })).toBeDisabled(); // terms not accepted yet
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Næste' }).click();

  await expect(page.getByRole('heading', { name: 'Vælg dine sider' })).toBeVisible();
  for (const host of ['chatgpt.com', 'claude.ai', 'gemini.google.com', 'copilot.microsoft.com']) {
    await expect(page.locator('.builtin li', { hasText: host })).toBeVisible();
  }
  await expect(page.getByText('Foreslåede sider')).toBeVisible();
  await expect(page.getByText('perplexity.ai · ')).toBeVisible();
  await page.getByRole('button', { name: 'Næste' }).click();

  await expect(page.getByRole('heading', { name: 'Tilpas' })).toBeVisible();
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { name: 'Set up' })).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(page.getByRole('heading', { name: 'Open source' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Report a bug' })).toHaveAttribute('href', /github\.com\/segiITU\/PromptSkjold\/issues/);
  await expect(page.getByRole('link', { name: 'Contribute' })).toHaveAttribute('href', /CONTRIBUTING\.md/);
  await expect(page.getByRole('link', { name: 'Visit ermias.ai' })).toHaveAttribute('href', 'https://ermias.ai');
  await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
  await page.close();
});

test('the setup controls change the real settings', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/onboarding/onboarding.html`);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Næste' }).click();
  await page.getByRole('button', { name: 'Næste' }).click();

  await page.getByRole('switch', { name: 'Tjek billeder og scannede filer' }).click();
  await page.getByRole('switch', { name: 'Organisationer' }).click();
  await page.getByLabel('Sprog for erstatninger').selectOption('da');

  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const stored = (await chrome.storage.local.get('pg_settings')).pg_settings;
        return [stored.imageCheckEnabled, stored.groupsEnabled.Organization, stored.syntheticLocale];
      }),
    )
    .toEqual([false, false, 'da']);
  await page.close();
});

test('the options page can open the guide again, and suggestions are listed there', async () => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options/options.html`);
  await expect(options.locator('#sites-section').getByText('Foreslåede sider')).toBeVisible();
  const [guide] = await Promise.all([context.waitForEvent('page'), options.getByRole('button', { name: 'Vis guide igen' }).click()]);
  await guide.waitForLoadState('domcontentloaded');
  expect(guide.url()).toContain('/onboarding/onboarding.html');
});
