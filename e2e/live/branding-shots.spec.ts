import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { ExtensionHarness } from './harness';

/** Real-build screenshots (dist) of the lockup headers, the popup intro line and the Excel/PowerPoint switch. Opt-in: UI_SHOTS_DIR=<dir>. */
const OUT = process.env.UI_SHOTS_DIR ?? '';
test.skip(!OUT, 'set UI_SHOTS_DIR');
test.setTimeout(240_000);

let harness: ExtensionHarness;

test.beforeAll(async () => {
  harness = await ExtensionHarness.launch({ buildDir: path.resolve('dist'), headless: true, viewport: { width: 1280, height: 800 }, locale: 'en-US', timezoneId: 'Europe/Copenhagen', deepDiagnostics: false, recordTrace: false });
  await harness.configure({ nerProvider: 'off', enabled: true });
  fs.mkdirSync(OUT, { recursive: true });
});
test.afterAll(async () => {
  await harness?.close();
});

test('headers, intro line, new switch (DA)', async () => {
  const base = `chrome-extension://${harness.extensionId}`;
  await harness.serviceWorker.evaluate(async () => chrome.storage.local.set({ pk_ui_language: 'da' }));

  for (const [label, w, h] of [['wide', 1200, 700], ['narrow', 390, 700]] as const) {
    const options = await harness.context.newPage();
    await options.setViewportSize({ width: w, height: h });
    await options.goto(`${base}/options/options.html`);
    await options.waitForTimeout(800);
    await options.screenshot({ path: path.join(OUT, `brand-options-header-${label}.png`) });
    if (label === 'wide') {
      await options.locator('#ocr-section').screenshot({ path: path.join(OUT, 'brand-options-office-switch.png') });
      expect(await options.locator('#ocr-section').getByRole('switch', { name: 'Tjek Excel- og PowerPoint-filer' }).getAttribute('aria-checked')).toBe('false');
    }
    await options.close();

    const guide = await harness.context.newPage();
    await guide.setViewportSize({ width: w, height: h });
    await guide.goto(`${base}/onboarding/onboarding.html`);
    await guide.waitForTimeout(600);
    await guide.screenshot({ path: path.join(OUT, `brand-onboarding-header-${label}.png`) });
    if (label === 'wide') {
      await guide.getByRole('checkbox').check();
      await guide.getByRole('button', { name: 'Næste' }).click();
      await guide.getByRole('button', { name: 'Næste' }).click();
      await guide.waitForTimeout(400);
      await guide.screenshot({ path: path.join(OUT, 'brand-onboarding-office-switch.png'), fullPage: true });
    }
    await guide.close();
  }

  const popup = await harness.context.newPage();
  await popup.setViewportSize({ width: 420, height: 600 });
  await popup.goto(`${base}/popup/popup.html`);
  await popup.waitForTimeout(1500);
  await popup.screenshot({ path: path.join(OUT, 'brand-popup-intro.png') });
  const toggle = popup.getByRole('switch', { name: 'Tjek Excel- og PowerPoint-filer' });
  await toggle.scrollIntoViewIfNeeded();
  await popup.screenshot({ path: path.join(OUT, 'brand-popup-office-switch.png') });
  expect(await toggle.getAttribute('aria-checked')).toBe('false');
  await toggle.click(); // the same storage key the options page reads
  await popup.waitForTimeout(400);
  const stored = await harness.serviceWorker.evaluate(async () => (await chrome.storage.local.get('pg_settings')).pg_settings?.officeCheckEnabled);
  expect(stored).toBe(true);
  await toggle.click();
  await popup.close();
});
