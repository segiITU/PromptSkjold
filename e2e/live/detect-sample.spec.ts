import fs from 'node:fs';
import path from 'node:path';
import { test } from '@playwright/test';
import { ExtensionHarness } from './harness';

/**
 * Reports what the real detector finds in the popup's sample text (pattern rules only, then pattern rules + the
 * local NER model). Opt-in: DETECT_REPORT=<file.json> npx playwright test --config e2e/live/playwright.screens.config.ts detect-sample
 */
const REPORT = process.env.DETECT_REPORT ?? '';
test.skip(!REPORT, 'set DETECT_REPORT');
test.setTimeout(240_000);

const TEXT =
  'Hej, jeg hedder Sebastian Gilson, og jeg er AI-udvikler hos ermias.ai. Jeg kan kontaktes på kontakt@ermias.ai eller +45 50930610. Mit CPR-nummer er i øvrigt 111111-1111.';

test('detector on the sample text', async () => {
  const harness = await ExtensionHarness.launch({
    buildDir: path.resolve('dist'),
    headless: true,
    viewport: { width: 420, height: 600 },
    locale: 'da-DK',
    timezoneId: 'Europe/Copenhagen',
    deepDiagnostics: false,
    recordTrace: false,
  });
  const out: Record<string, unknown> = {};
  try {
    const page = await harness.context.newPage();
    await page.goto(`chrome-extension://${harness.extensionId}/popup/popup.html`);
    await page.waitForTimeout(1500);
    for (const provider of ['off', 'transformers'] as const) {
      const res = await page.evaluate(
        async ({ text, provider }) => {
          const r: any = await chrome.runtime.sendMessage({
            type: 'DETECT_PII',
            payload: { text, requestId: `rep_${provider}`, config: { ner_provider: provider, ner_model: 'bardsai-mini', min_confidence: 0 } },
          });
          return r?.payload ?? r;
        },
        { text: TEXT, provider },
      );
      out[provider] = res;
    }
  } finally {
    await harness.close();
  }
  fs.writeFileSync(REPORT, JSON.stringify(out, null, 2));
});
