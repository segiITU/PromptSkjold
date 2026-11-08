import path from 'node:path';
import { expect, test } from '@playwright/test';
import { ExtensionHarness } from './harness';

/**
 * The unmodified build asks Chrome for access to the added site. When the
 * user refuses, the options page must show the red cross and the Danish
 * "cannot be accessed" message, and nothing may be registered for the site.
 */

let harness: ExtensionHarness;

test.beforeAll(async () => {
  harness = await ExtensionHarness.launch({
    buildDir: path.resolve('dist'),
    headless: true,
    viewport: { width: 1200, height: 800 },
    locale: 'en-US',
    timezoneId: 'Europe/Copenhagen',
    deepDiagnostics: false,
    recordTrace: false,
  });
});

test.afterAll(async () => {
  await harness.close();
});

test('a refused permission shows a red cross and the "cannot be accessed" message', async () => {
  const options = await harness.context.newPage();
  await options.goto(`chrome-extension://${harness.extensionId}/options/options.html`);
  const card = options.locator('#sites-section');

  // Automation leaves the prompt open; answer it the way Chrome does when the user clicks Block.
  await options.evaluate(() => {
    chrome.permissions.request = (async () => false) as typeof chrome.permissions.request;
  });

  await card.getByPlaceholder('fx chat.dk').fill('chat.dk');
  await card.locator('form').getByRole('button', { name: 'Tilføj' }).click();

  const row = card.locator('.sites li', { hasText: 'chat.dk' }).filter({ hasNotText: 'Indbygget' });
  await expect(row.getByRole('img', { name: '×' })).toBeVisible({ timeout: 15_000 });
  await expect(row.getByRole('alert')).toContainText('Siden kan ikke tilgås af PromptSkjold');
  await expect(row.getByRole('button', { name: 'Prøv igen' })).toBeVisible();

  const registered = await harness.serviceWorker.evaluate(async () => {
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    return scripts.filter((script) => script.id.startsWith('pg-user-')).length;
  });
  expect(registered).toBe(0);
  await options.close();
});
