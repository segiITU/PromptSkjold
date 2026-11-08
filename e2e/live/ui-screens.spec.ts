import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { ExtensionHarness } from './harness';
import { clickOverlayElement } from './overlay-click';

/**
 * Screenshots of every UI surface in Danish and English at several widths,
 * against the built extension in `dist`. Opt-in:
 *   UI_SHOTS_DIR=<dir> npx playwright test --config e2e/live/playwright.screens.config.ts
 * The "chat page" is a local mock served through route interception; nothing
 * leaves the machine.
 */
const OUT = process.env.UI_SHOTS_DIR ?? '';
test.skip(!OUT, 'set UI_SHOTS_DIR');
test.setTimeout(240_000);

const SAMPLE = 'Hej, jeg hedder Sebastian Gilson, og jeg er AI-udvikler hos ermias.ai. Jeg kan kontaktes på kontakt@ermias.ai eller +45 50930610. Mit CPR-nummer er i øvrigt 111111-1111.';

const MOCK_PAGE = `<!doctype html><html><body style="font-family:sans-serif;background:#fff"><main>
  <h1>Chat</h1><textarea id="prompt-textarea" style="width:500px;height:80px"></textarea></main></body></html>`;

let harness: ExtensionHarness;

test.beforeAll(async () => {
  harness = await ExtensionHarness.launch({
    buildDir: path.resolve('dist'),
    headless: true,
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    timezoneId: 'Europe/Copenhagen',
    deepDiagnostics: false,
    recordTrace: false,
  });
  await harness.configure({ nerProvider: 'off', enabled: true, defaultReplacementMode: 'placeholder' });
  fs.mkdirSync(OUT, { recursive: true });
});

test.afterAll(async () => {
  await harness?.close();
});

async function setLanguage(lang: 'da' | 'en') {
  await harness.serviceWorker.evaluate(async (l) => {
    await chrome.storage.local.set({ pk_ui_language: l });
  }, lang);
}

test('sites: an added site joins the protected list (onboarding) and the options card', async () => {
  await setLanguage('da');
  await harness.serviceWorker.evaluate(async () => {
    await chrome.storage.local.set({
      pg_user_sites: [{ host: 'chat.dk', addedAt: Date.now() }],
      pg_user_site_status: { 'chat.dk': { state: 'active' } },
    });
  });
  const base = `chrome-extension://${harness.extensionId}`;
  const guide = await harness.context.newPage();
  await guide.setViewportSize({ width: 900, height: 760 });
  await guide.goto(`${base}/onboarding/onboarding.html`);
  await guide.getByRole('checkbox').check();
  await guide.getByRole('button', { name: 'Næste' }).click();
  await expect(guide.locator('.builtin li', { hasText: 'chat.dk' })).toBeVisible();
  await guide.screenshot({ path: path.join(OUT, 'sites-onboarding.png') });
  await guide.close();
  const options = await harness.context.newPage();
  await options.setViewportSize({ width: 1100, height: 900 });
  await options.goto(`${base}/options/options.html#sites-section`);
  await options.waitForTimeout(800);
  await options.locator('#sites-section').screenshot({ path: path.join(OUT, 'sites-options.png') });
  await options.close();
  await harness.serviceWorker.evaluate(async () => {
    await chrome.storage.local.remove(['pg_user_sites', 'pg_user_site_status']);
  });
});

for (const lang of ['da', 'en'] as const) {
  test(`page chip and in-page indicator in ${lang}`, async () => {
    await setLanguage(lang);
    const page = await harness.context.newPage();
    await page.setViewportSize({ width: 900, height: 600 });
    await page.route('https://chatgpt.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: MOCK_PAGE }),
    );
    await page.goto('https://chatgpt.com/');
    await page.waitForSelector('#prompt-textarea');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, `chip-${lang}.png`) });
    await page.focus('#prompt-textarea');
    await page.evaluate((text) => {
      const el = document.getElementById('prompt-textarea')!;
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, 'Ingen personoplysninger her, kun almindelig tekst om vejret i dag.');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `indicator-${lang}.png`) });
    await page.close();
  });

  test(`popup and options in ${lang}`, async () => {
    await setLanguage(lang);
    const base = `chrome-extension://${harness.extensionId}`;
    const popup = await harness.context.newPage();
    await popup.setViewportSize({ width: 420, height: 600 });
    await popup.goto(`${base}/popup/popup.html`);
    await popup.waitForTimeout(1500);
    await popup.screenshot({ path: path.join(OUT, `popup-${lang}.png`) });
    for (const tab of [1, 2, 3]) {
      const tabs = popup.getByRole('tab');
      if ((await tabs.count()) > tab) {
        await tabs.nth(tab).click();
        await popup.waitForTimeout(400);
        await popup.screenshot({ path: path.join(OUT, `popup-${lang}-tab${tab}.png`) });
        if (tab === 2) {
          await popup.getByRole('button', { name: /Tjek teksten|Check the text/ }).click();
          await popup.waitForTimeout(1500);
          await popup.screenshot({ path: path.join(OUT, `popup-${lang}-test-result.png`) });
        }
      }
    }
    await popup.close();

    for (const [w, h] of [
      [1200, 900],
      [800, 900],
      [390, 844],
    ]) {
      const options = await harness.context.newPage();
      await options.setViewportSize({ width: w, height: h });
      await options.goto(`${base}/options/options.html`);
      await options.waitForTimeout(1500);
      await options.screenshot({ path: path.join(OUT, `options-${lang}-${w}.png`), fullPage: true });
      await options.close();
    }
  });

  test(`review overlay in ${lang}`, async () => {
    await setLanguage(lang);
    for (const [w, h] of [
      [1280, 800],
      [820, 900],
      [390, 844],
    ]) {
      const page = await harness.context.newPage();
      await page.setViewportSize({ width: w, height: h });
      await page.route('https://chatgpt.com/**', (route) =>
        route.fulfill({ status: 200, contentType: 'text/html', body: MOCK_PAGE }),
      );
      await page.goto('https://chatgpt.com/');
      await page.waitForSelector('#prompt-textarea');
      await page.waitForTimeout(1500);
      await page.focus('#prompt-textarea');
      await page.evaluate((text) => {
        const el = document.getElementById('prompt-textarea')!;
        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      }, SAMPLE);
      await page.waitForSelector('#pg-review-overlay-host', { state: 'attached', timeout: 30_000 });
      await page.waitForTimeout(1800);
      await page.screenshot({ path: path.join(OUT, `overlay-${lang}-${w}.png`) });
      if (w === 1280) {
        // Keep the first finding, then replace it again: the marker bar strikes the original, then the stamp lands.
        await clickOverlayElement(page, 'pk-act-keep', 0);
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(OUT, `overlay-${lang}-kept.png`) });
        await clickOverlayElement(page, 'pk-act-replace', 0);
        await page.waitForTimeout(330);
        await page.screenshot({ path: path.join(OUT, `overlay-${lang}-strike.png`) });
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(OUT, `overlay-${lang}-stamp.png`) });
        await page.waitForTimeout(1200);
        await page.screenshot({ path: path.join(OUT, `overlay-${lang}-after.png`) });
      }
      await page.close();
    }
  });
}
