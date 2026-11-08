import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { clickExtensionShadowControl } from './closed-shadow-control';
import { clickOverlayElement } from './overlay-click';
import { ExtensionHarness } from './harness';

/**
 * Takes screenshots of the review for a text file, a PDF and an image so the
 * layout can be looked at. Opt-in:
 *   OCR_TEST_FILES=<dir> OCR_OUT_DIR=<dir for the pictures> \
 *   npx playwright test --config e2e/live/playwright.ocr.config.ts overlay-screenshots
 */
const FILES_DIR = process.env.OCR_TEST_FILES ?? '';
const OUT_DIR = process.env.OCR_OUT_DIR ?? '';

const MOCK_PAGE = `<!doctype html><html><body><main>
  <textarea id="prompt-textarea" style="width:500px;height:80px"></textarea>
  <input type="file" id="up" multiple></main>
<script>
  document.getElementById('up').addEventListener('change', async (e) => {
    for (const file of e.target.files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let bin = '';
      for (const b of bytes) bin += String.fromCharCode(b);
      await fetch('/backend-api/upload', { method: 'POST', body: JSON.stringify({ name: file.name, b64: btoa(bin) }) });
    }
  });
</script></body></html>`;

let harness: ExtensionHarness;
let received: Array<{ name: string; bytes: Buffer }>;

test.skip(!FILES_DIR || !OUT_DIR, 'set OCR_TEST_FILES and OCR_OUT_DIR');
test.setTimeout(180_000);

test.beforeAll(async () => {
  harness = await ExtensionHarness.launch({
    buildDir: path.resolve('dist'),
    headless: true,
    viewport: { width: 1100, height: 760 },
    locale: 'en-US',
    timezoneId: 'Europe/Copenhagen',
    deepDiagnostics: false,
    recordTrace: false,
  });
  await harness.configure({ nerProvider: 'off', enabled: true, imageCheckEnabled: true, defaultReplacementMode: 'placeholder' });
  const options = await harness.context.newPage();
  await options.goto(`chrome-extension://${harness.extensionId}/options/options.html`);
  await options.close();
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

test.afterAll(async () => {
  await harness?.close();
});

test.beforeEach(async () => {
  const page = harness.page;
  await page.unroute('https://chatgpt.com/**').catch(() => undefined);
  received = [];
  await page.route('https://chatgpt.com/**', async (route) => {
    if (new URL(route.request().url()).pathname === '/backend-api/upload') {
      const { name, b64 } = JSON.parse(route.request().postData() ?? '{}');
      received.push({ name, bytes: Buffer.from(b64, 'base64') });
      await route.fulfill({ status: 200, body: '{}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'text/html', body: MOCK_PAGE });
  });
  await page.goto('https://chatgpt.com/');
  await page.waitForSelector('#up', { state: 'attached' });
  await page.waitForTimeout(1500);
});

for (const [label, files] of [
  ['text', ['08_note.txt']],
  ['pdf', ['06_brev_tekstlag.pdf']],
  ['several', ['08_note.txt', '06_brev_tekstlag.pdf']],
  ['image', ['01_brev_ren.png']],
  ['jpg', ['02_loensedddel_scan_skaev.jpg']],
] as const) {
  test(`screenshot of the review: ${label}`, async () => {
    const page = harness.page;
    await page.setInputFiles('#up', files.map((f) => path.join(FILES_DIR, f)));
    await expect(page.locator('#pg-review-overlay-host')).toHaveCount(1, { timeout: 30_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT_DIR, `review-${label}.png`) });
  });
}

for (const name of ['01_brev_ren.png', '02_loensedddel_scan_skaev.jpg', '03_chat_skaermbillede.png']) {
  test(`blacking out ${name} from the review gives a picture to look at`, async () => {
    const page = harness.page;
    await page.setInputFiles('#up', path.join(FILES_DIR, name));
    await expect(page.locator('#pg-review-overlay-host')).toHaveCount(1, { timeout: 30_000 });
    await clickExtensionShadowControl(page, '#pg-review-overlay-host', { id: 'pg-confirm-btn' });
    await expect.poll(() => received.length, { timeout: 20_000 }).toBe(1);
    expect(received[0].name).toMatch(/-redacted\.png$/);
    fs.writeFileSync(path.join(OUT_DIR, `result-${received[0].name}`), received[0].bytes);
  });
}

test('clicking an item in the text shows a notice', async () => {
  const page = harness.page;
  await page.setInputFiles('#up', path.join(FILES_DIR, '08_note.txt'));
  await expect(page.locator('#pg-review-overlay-host')).toHaveCount(1, { timeout: 30_000 });
  await page.waitForTimeout(500);
  await clickOverlayElement(page, 'pg-highlight', 0);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT_DIR, 'review-notice-text.png') });
});

test('clicking an item on a picture shows a notice and the colours stand out', async () => {
  const page = harness.page;
  await page.setInputFiles('#up', path.join(FILES_DIR, '01_brev_ren.png'));
  await expect(page.locator('#pg-review-overlay-host')).toHaveCount(1, { timeout: 30_000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT_DIR, 'review-colours-image.png') });
  await clickOverlayElement(page, 'pg-image-box', 0);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT_DIR, 'review-notice-image.png') });
});
