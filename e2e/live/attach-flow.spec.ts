import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { clickExtensionShadowControl } from './closed-shadow-control';
import { ExtensionHarness } from './harness';

/**
 * Real-Chromium check of the attachment flow for text, CSV and Word files:
 * a file is chosen on a mock chat page, the review opens, and what the page
 * finally receives is checked. Opt-in (needs the test files outside the repo):
 *   OCR_TEST_FILES=<dir> npx playwright test --config e2e/live/playwright.ocr.config.ts
 */
const FILES_DIR = process.env.OCR_TEST_FILES ?? '';

const MOCK_PAGE = `<!doctype html><html><body>
<main>
  <textarea id="prompt-textarea" style="width:500px;height:80px"></textarea>
  <input type="file" id="up" multiple>
</main>
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

test.skip(!FILES_DIR, 'set OCR_TEST_FILES');
test.setTimeout(120_000);

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
  await harness.configure({ nerProvider: 'off', enabled: true, imageCheckEnabled: true, defaultReplacementMode: 'placeholder' });
});

test.afterAll(async () => {
  await harness?.close();
});

test.beforeEach(async () => {
  received = [];
  const page = harness.page;
  await page.unroute('https://chatgpt.com/**').catch(() => undefined);
  await page.route('https://chatgpt.com/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/backend-api/upload') {
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

const file = (name: string) => path.join(FILES_DIR, name);

test('a text file is held, reviewed, and attached with replacements', async () => {
  const page = harness.page;
  await page.setInputFiles('#up', file('08_note.txt'));
  await expect(page.locator('#pg-review-overlay-host')).toHaveCount(1, { timeout: 15_000 });
  expect(received).toEqual([]);
  await clickExtensionShadowControl(page, '#pg-review-overlay-host', { id: 'pg-confirm-btn' });
  await expect.poll(() => received.length, { timeout: 15_000 }).toBe(1);
  expect(received[0].name).toBe('08_note-anonymised.txt');
  const text = received[0].bytes.toString('utf8');
  expect(text).not.toContain('140692-1234');
  expect(text).not.toContain('mikkel.rask@mail.dk');
  expect(text).toContain('Afgørelse om boligstøtte');
});

test('a CSV keeps its columns after replacement', async () => {
  const page = harness.page;
  await page.setInputFiles('#up', file('09_kunder.csv'));
  await expect(page.locator('#pg-review-overlay-host')).toHaveCount(1, { timeout: 15_000 });
  await clickExtensionShadowControl(page, '#pg-review-overlay-host', { id: 'pg-confirm-btn' });
  await expect.poll(() => received.length, { timeout: 15_000 }).toBe(1);
  expect(received[0].name).toBe('09_kunder-anonymised.csv');
  const lines = received[0].bytes.toString('utf8').trim().split(/\r?\n/);
  expect(lines[0]).toBe('navn,cpr,telefon,email,adresse');
  expect(lines).toHaveLength(3);
  expect(received[0].bytes.toString('utf8')).not.toContain('140692-1234');
});

test('a Word file comes back as a Word file with the items replaced', async () => {
  const page = harness.page;
  await page.setInputFiles('#up', file('10_brev.docx'));
  await expect(page.locator('#pg-review-overlay-host')).toHaveCount(1, { timeout: 15_000 });
  await clickExtensionShadowControl(page, '#pg-review-overlay-host', { id: 'pg-confirm-btn' });
  await expect.poll(() => received.length, { timeout: 15_000 }).toBe(1);
  expect(received[0].name).toBe('10_brev-anonymised.docx');
  const parts = unzipSync(new Uint8Array(received[0].bytes));
  const xml = Buffer.from(parts['word/document.xml']).toString('utf8');
  expect(xml).not.toContain('140692-1234');
  expect(xml).not.toContain('mikkel.rask@mail.dk');
  expect(xml).toContain('boligstøtte');
});

test('a PDF with a text layer is attached as a plain-text copy with the items replaced', async () => {
  const page = harness.page;
  await page.setInputFiles('#up', file('06_brev_tekstlag.pdf'));
  await expect(page.locator('#pg-review-overlay-host')).toHaveCount(1, { timeout: 20_000 });
  await clickExtensionShadowControl(page, '#pg-review-overlay-host', { id: 'pg-confirm-btn' });
  await expect.poll(() => received.length, { timeout: 15_000 }).toBe(1);
  expect(received[0].name).toBe('06_brev_tekstlag-anonymised.txt');
  const text = received[0].bytes.toString('utf8');
  expect(text).not.toContain('140692-1234');
  expect(text).toContain('boligstøtte');
});

test('Markdown and JSON files are checked, and JSON stays valid after replacement', async () => {
  const page = harness.page;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-attach-'));
  const md = path.join(dir, 'noter.md');
  const json = path.join(dir, 'kunde.json');
  fs.writeFileSync(md, '# Møde\n\nMin CPR er 140692-1234 og min mail er mikkel.rask@mail.dk.\n');
  fs.writeFileSync(json, JSON.stringify({ navn: 'Mikkel', cpr: '140692-1234', mail: 'mikkel.rask@mail.dk', antal: 3 }));
  await page.setInputFiles('#up', [md, json]);
  for (let i = 0; i < 2; i++) {
    await expect(page.locator('#pg-review-overlay-host')).toHaveCount(1, { timeout: 15_000 });
    await clickExtensionShadowControl(page, '#pg-review-overlay-host', { id: 'pg-confirm-btn' });
    await page.waitForTimeout(300);
  }
  await expect.poll(() => received.length, { timeout: 15_000 }).toBe(2);
  const byName = Object.fromEntries(received.map((r) => [r.name, r.bytes.toString('utf8')]));
  expect(byName['noter-anonymised.md']).toContain('# Møde');
  expect(byName['noter-anonymised.md']).not.toContain('140692-1234');
  const parsed = JSON.parse(byName['kunde-anonymised.json']);
  expect(parsed.antal).toBe(3);
  expect(JSON.stringify(parsed)).not.toContain('140692-1234');
  expect(JSON.stringify(parsed)).not.toContain('mikkel.rask@mail.dk');
});

test('realistic mode on a Danish file uses generic numbers', async () => {
  const page = harness.page;
  // Identities this test has not stored before: a stored record keeps the mode it was made in.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-attach-'));
  const note = path.join(dir, 'brev.txt');
  fs.writeFileSync(note, 'Hej, min CPR er 150575-2345, og telefon 33 44 55 66. Min mail er anna.berg@mail.dk.\n');
  await harness.configure({ defaultReplacementMode: 'synthetic' });
  try {
    await page.reload();
    await page.waitForSelector('#up', { state: 'attached' });
    await page.waitForTimeout(1500);
    await page.setInputFiles('#up', note);
    await expect(page.locator('#pg-review-overlay-host')).toHaveCount(1, { timeout: 15_000 });
    await clickExtensionShadowControl(page, '#pg-review-overlay-host', { id: 'pg-confirm-btn' });
    await expect.poll(() => received.length, { timeout: 15_000 }).toBe(1);
    const text = received[0].bytes.toString('utf8');
    expect(text).toMatch(/123456-78\d\d/);
    expect(text).toMatch(/\+45 1234\d{4}/);
    expect(text).not.toContain('150575-2345');
    expect(text).not.toContain('33 44 55 66');
    expect(text).not.toMatch(/\+1 \(555\)|555-/);
  } finally {
    await harness.configure({ defaultReplacementMode: 'placeholder' });
  }
});

test('Escape in the review leaves the file out', async () => {
  const page = harness.page;
  await page.setInputFiles('#up', file('08_note.txt'));
  await expect(page.locator('#pg-review-overlay-host')).toHaveCount(1, { timeout: 15_000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('#pg-review-overlay-host')).toHaveCount(0);
  await page.waitForTimeout(800);
  expect(received).toEqual([]);
});

test('several files are reviewed one after the other and arrive together', async () => {
  const page = harness.page;
  await page.setInputFiles('#up', [file('08_note.txt'), file('09_kunder.csv')]);
  await expect(page.locator('#pg-review-overlay-host')).toHaveCount(1, { timeout: 15_000 });
  await clickExtensionShadowControl(page, '#pg-review-overlay-host', { id: 'pg-confirm-btn' });
  await expect(page.locator('#pg-review-overlay-host')).toHaveCount(1, { timeout: 15_000 });
  await clickExtensionShadowControl(page, '#pg-review-overlay-host', { id: 'pg-confirm-btn' });
  await expect.poll(() => received.length, { timeout: 15_000 }).toBe(2);
  expect(received.map((r) => r.name).sort()).toEqual(['08_note-anonymised.txt', '09_kunder-anonymised.csv']);
});
