import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { ExtensionHarness } from './harness';
import { clickOverlayElement } from './overlay-click';

/**
 * The real built extension (dist, loaded unpacked) on a LOCAL mock chat page only (route-fulfilled at
 * https://chatgpt.com/, nothing leaves the machine, no logins). Takes real screenshots into UI_SHOTS_DIR as real-*.png
 * and writes what the detector found to real-report.json. Opt-in:
 *   UI_SHOTS_DIR=<dir> npx playwright test --config e2e/live/playwright.screens.config.ts real-extension
 */
const OUT = process.env.UI_SHOTS_DIR ?? '';
test.skip(!OUT, 'set UI_SHOTS_DIR');
test.setTimeout(420_000);

const TEXT = [
  'Hej, jeg hedder Sebastian Gilson, og jeg er AI-udvikler hos ermias.ai. Jeg kan kontaktes på kontakt@ermias.ai eller +45 50930610. Mit CPR-nummer er i øvrigt 111111-1111.',
  'tlf. 50930610',
  'Mobilnr.: 20 34 56 78',
  'Ordrenummer: 20481937',
].join('\n');

const MOCK_PAGE = `<!doctype html><html><body style="font-family:sans-serif;background:#fff"><main>
  <h1>Chat</h1><form id="f"><textarea id="prompt-textarea" style="width:560px;height:90px"></textarea><button type="submit" data-testid="send-button">Send</button></form></main></body></html>`;

let harness: ExtensionHarness;
const report: Record<string, unknown> = {};

test.beforeAll(async () => {
  harness = await ExtensionHarness.launch({
    buildDir: path.resolve('dist'),
    headless: true,
    viewport: { width: 1280, height: 800 },
    locale: 'da-DK',
    timezoneId: 'Europe/Copenhagen',
    deepDiagnostics: false,
    recordTrace: false,
  });
  await harness.configure({ nerProvider: 'transformers', enabled: true, defaultReplacementMode: 'placeholder' });
  fs.mkdirSync(OUT, { recursive: true });
});

test.afterAll(async () => {
  fs.writeFileSync(path.join(OUT, 'real-report.json'), JSON.stringify(report, null, 2));
  await harness?.close();
});

async function setLanguage(lang: 'da' | 'en') {
  await harness.serviceWorker.evaluate(async (l) => chrome.storage.local.set({ pk_ui_language: l }), lang);
}

test('what the real detector finds in the new text (pattern + local AI)', async () => {
  const page = await harness.context.newPage();
  await page.goto(`chrome-extension://${harness.extensionId}/popup/popup.html`);
  await page.waitForTimeout(1500);
  for (const provider of ['off', 'transformers'] as const) {
    report[`detect_${provider}`] = await page.evaluate(
      async ({ text, provider }) => {
        const r: any = await chrome.runtime.sendMessage({
          type: 'DETECT_PII',
          payload: { text, requestId: `real_${provider}`, config: { ner_provider: provider, ner_model: 'bardsai-mini', min_confidence: 0 } },
        });
        return (r?.payload?.spans ?? []).map((s: any) => `${s.entity_type}|${JSON.stringify(s.text)}|${s.score.toFixed(2)}|${s.source}`);
      },
      { text: TEXT, provider },
    );
  }
  await page.close();
});

for (const lang of ['da', 'en'] as const) {
  test(`review overlay, strike and stamp, in-page pieces (${lang})`, async () => {
    await setLanguage(lang);
    const page = await harness.context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.route('https://chatgpt.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: MOCK_PAGE }));
    await page.goto('https://chatgpt.com/');
    await page.waitForSelector('#prompt-textarea');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, `real-page-chip-${lang}.png`) });
    await page.focus('#prompt-textarea');
    await page.evaluate((text) => {
      const el = document.getElementById('prompt-textarea')!;
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, TEXT);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, `real-scanning-${lang}.png`) });
    await page.waitForSelector('#pg-review-overlay-host', { state: 'attached', timeout: 120_000 });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(OUT, `real-overlay-${lang}.png`) });
    if (lang === 'da') {
      await clickOverlayElement(page, 'pk-act-keep', 0);
      await page.waitForTimeout(400);
      await clickOverlayElement(page, 'pk-act-replace', 0);
      await page.waitForTimeout(330);
      await page.screenshot({ path: path.join(OUT, 'real-overlay-strike.png') });
      await page.waitForTimeout(450);
      await page.screenshot({ path: path.join(OUT, 'real-overlay-stamp.png') });
    }
    await page.close();
  });

  test(`popup and Test tab on the real build (${lang})`, async () => {
    await setLanguage(lang);
    const popup = await harness.context.newPage();
    await popup.setViewportSize({ width: 420, height: 600 });
    await popup.goto(`chrome-extension://${harness.extensionId}/popup/popup.html`);
    await popup.waitForTimeout(1500);
    await popup.screenshot({ path: path.join(OUT, `real-popup-${lang}.png`) });
    const tabs = popup.getByRole('tab');
    await tabs.nth(1).click();
    await popup.waitForTimeout(400);
    await popup.screenshot({ path: path.join(OUT, `real-popup-${lang}-rules.png`) });
    await tabs.nth(2).click();
    await popup.waitForTimeout(400);
    await popup.locator('#pk-test-input').fill(TEXT);
    await popup.getByRole('button', { name: /Tjek teksten|Check the text/ }).click();
    await expect(popup.locator('#pk-checked-text mark').first()).toBeVisible({ timeout: 90_000 });
    await popup.waitForTimeout(500);
    report[`popup_marks_${lang}`] = await popup.locator('#pk-checked-text mark').evaluateAll((els) => els.map((e) => `${(e as HTMLElement).dataset.cat}|${e.textContent?.replace(/\s+\(.*\)$/, '')}`));
    await popup.screenshot({ path: path.join(OUT, `real-popup-${lang}-test.png`), fullPage: true });
    await popup.close();
  });
}
