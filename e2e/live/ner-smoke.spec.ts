import path from 'node:path';
import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { clickExtensionShadowControl } from './closed-shadow-control';
import { ExtensionHarness } from './harness';

test.skip(!existsSync(path.resolve('dist/models/ner/bardsai-mini-da-en/onnx/model_quantized.onnx')),
  'Real NER smoke tests require the packaged model; model-free CI still verifies failure and pattern-only paths.');

/**
 * Real-Chromium check that typed prompts are held before transmission.
 *
 * A mock "ChatGPT" page is served at https://chatgpt.com/ (so the content
 * script matches). Its send action does fetch() to a mock backend endpoint;
 * the test counts and inspects what actually leaves the page.
 */

const MOCK_PAGE = `<!doctype html><html><body>
<main>
  <form id="f"><textarea id="prompt-textarea" style="width:500px;height:80px"></textarea>
  <button type="submit" data-testid="send-button">Send</button></form>
</main>
<script>
  document.getElementById('f').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = document.getElementById('prompt-textarea').value;
    fetch('/backend-api/conversation', { method: 'POST', body: JSON.stringify({ text }) });
    document.getElementById('prompt-textarea').value = '';
  });
  document.getElementById('prompt-textarea').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('f').requestSubmit();
    }
  });
</script></body></html>`;

let harness: ExtensionHarness;
let sent: string[];

test.beforeAll(async () => {
  harness = await ExtensionHarness.launch({
    buildDir: path.resolve('dist'),
    headless: true,
    viewport: { width: 1200, height: 800 },
    locale: 'da-DK',
    timezoneId: 'Europe/Copenhagen',
    deepDiagnostics: false,
    recordTrace: false,
  });
  await harness.configure({ nerProvider: 'transformers', enabled: true });
});

test.afterAll(async () => {
  await harness.close();
});

test.beforeEach(async () => {
  sent = [];
  const page = harness.page;
  await page.unroute('https://chatgpt.com/**').catch(() => undefined);
  await page.route('https://chatgpt.com/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/backend-api/conversation') {
      sent.push(route.request().postData() ?? '');
      await route.fulfill({ status: 200, body: '{}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'text/html', body: MOCK_PAGE });
  });
  await page.goto('https://chatgpt.com/');
  await page.waitForSelector('#prompt-textarea');
  await page.waitForTimeout(1500);
});

const PROMPTS = [
  'Mit navn er Peter Hansen og jeg bor på Vestergade 12, 8000 Aarhus C',
  'Skriv en mail til Mette Sørensen hos Novo Nordisk om hendes ansøgning',
  'Write a poem about the sea',
];

for (const prompt of PROMPTS) {
  test(`NER scan: ${prompt.slice(0, 40)}`, async () => {
    const page = harness.page;
    await page.fill('#prompt-textarea', prompt);
    const t0 = Date.now();
    await page.press('#prompt-textarea', 'Enter');
    const outcome = await Promise.race([
      page.locator('#pg-review-overlay-host').waitFor({ state: 'attached', timeout: 60_000 }).then(() => 'overlay'),
      (async () => { while (sent.length === 0) await page.waitForTimeout(100); return 'sent'; })(),
    ]);
    console.log(`RESULT ${JSON.stringify({ prompt, outcome, ms: Date.now() - t0 })}`);
    expect(outcome).toBe(prompt === 'Write a poem about the sea' ? 'sent' : 'overlay');
    await page.waitForTimeout(500);
    if (outcome === 'overlay') expect(sent).toEqual([]);
  });
}
