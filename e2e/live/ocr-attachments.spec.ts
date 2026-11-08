import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ExtensionHarness } from './harness';

/**
 * Real-Chromium check of the OCR and PDF paths: files are sent through the
 * extension one after another, as the attachment interceptor does for several
 * files, and blacked-out PDFs are built and saved for inspection.
 *
 * Needs test files outside the repo, so it is not
 * part of the default harness run:
 *   OCR_TEST_FILES=<dir> \
 *   [OCR_OUT_DIR=<dir for the blacked-out PDFs>] \
 *   npx playwright test --config e2e/live/playwright.ocr.config.ts
 */
const FILES_DIR = process.env.OCR_TEST_FILES ?? '';
const OUT_DIR = process.env.OCR_OUT_DIR ?? '';
const ENABLED = Boolean(FILES_DIR);

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.pdf': 'application/pdf' };

let harness: ExtensionHarness;
let page: Page;

test.skip(!ENABLED, 'set OCR_TEST_FILES');
test.setTimeout(300_000);

const dataUrlOf = (name: string) =>
  `data:${MIME[path.extname(name).toLowerCase()]};base64,${fs.readFileSync(path.join(FILES_DIR, name)).toString('base64')}`;

/** Send one message from an extension page, giving up (as a failure) after 120 s. */
async function send(message: Record<string, unknown>): Promise<{ payload: Record<string, any> } | undefined> {
  return (await page.evaluate(
    async (m) =>
      Promise.race([
        chrome.runtime.sendMessage(m),
        new Promise((resolve) =>
          setTimeout(() => resolve({ payload: { status: 'test-timeout', message: 'no answer in 120 s' } }), 120_000),
        ),
      ]),
    message,
  )) as { payload: Record<string, any> } | undefined;
}

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
  await harness.configure({ nerProvider: 'off', enabled: true, imageCheckEnabled: true });
  page = await harness.context.newPage();
  page.on('console', (m) => console.log('[page]', m.text().slice(0, 300)));
  await page.goto(`chrome-extension://${harness.extensionId}/options/options.html`);

});

test.afterAll(async () => {
  await harness?.close();
});

test('several files in a row are all read', async () => {
  const names = fs
    .readdirSync(FILES_DIR)
    .filter((f) => /^(0[1-7])_/.test(f))
    .sort();
  const results: string[] = [];
  for (const name of names) {
    const started = Date.now();
    const response = await send({ type: 'OCR_IMAGE', payload: { requestId: `req-${name}`, dataUrl: dataUrlOf(name) } });
    const p = response?.payload;
    results.push(
      `${name}: status=${p?.status} items=${p?.spans?.length} chars=${String(p?.text ?? '').length} ` +
        `ms=${Date.now() - started} msg=${p?.message ?? ''}`,
    );
    console.log(results[results.length - 1]);
    // Items that were found in the text but could not be placed on the picture.
    const spans = (p?.spans ?? []) as Array<{ text: string; entity_type: string }>;
    const boxes = (p?.boxes ?? []) as unknown[][];
    spans.forEach((s, i) => {
      if (!boxes[i]?.length) console.log(`   not located: ${s.entity_type} ${JSON.stringify(s.text)}`);
    });
  }
  expect(results.filter((r) => !r.includes('status=ok'))).toEqual([]);
});

test('blacked-out PDFs are built for a text-layer and a scanned PDF', async () => {
  test.skip(!OUT_DIR, 'set OCR_OUT_DIR to also save the blacked-out PDFs');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const name of ['06_brev_tekstlag.pdf', '07_scannet_pdf_2_sider.pdf']) {
    const read = await send({ type: 'OCR_IMAGE', payload: { requestId: `read-${name}`, dataUrl: dataUrlOf(name) } });
    const items = [...new Set<string>((read?.payload.spans as Array<{ text: string }>).map((s) => s.text))];
    const started = Date.now();
    const out = await send({ type: 'REDACT_PDF', payload: { requestId: `red-${name}`, dataUrl: dataUrlOf(name), items } });
    console.log(
      `${name}: status=${out?.payload.status} pages=${out?.payload.pages} missed=${JSON.stringify(out?.payload.missed)} ` +
        `ms=${Date.now() - started} msg=${out?.payload.message ?? ''}`,
    );
    expect(out?.payload.status).toBe('ok');
    const dataUrl = out?.payload.dataUrl as string;
    fs.writeFileSync(path.join(OUT_DIR, name.replace('.pdf', '-redacted.pdf')), Buffer.from(dataUrl.split(',')[1], 'base64'));
    fs.writeFileSync(path.join(OUT_DIR, name.replace('.pdf', '-items.json')), JSON.stringify(items, null, 1));
  }
});
