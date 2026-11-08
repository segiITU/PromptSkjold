import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { expect, test } from '@playwright/test';
import { clickExtensionShadowControl } from './closed-shadow-control';
import { ExtensionHarness } from './harness';

/**
 * Real-Chromium check that Excel and PowerPoint files attached to a chat are
 * held, reviewed, and handed to the page again in the same format with the
 * personal data replaced. The files are built here, so nothing outside the
 * repository is needed.
 */

const MOCK_PAGE = `<!doctype html><html><body>
<main><input type="file" id="up" multiple></main>
<script>
  async function upload(e) {
    if ((e.type === 'input') !== Boolean(window.uploadOnInput)) return;
    for (const file of e.target.files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let bin = '';
      for (const b of bytes) bin += String.fromCharCode(b);
      await fetch('/backend-api/upload', { method: 'POST', body: JSON.stringify({ name: file.name, b64: btoa(bin) }) });
    }
  }
  document.getElementById('up').addEventListener('input', upload);
  document.getElementById('up').addEventListener('change', upload);
</script></body></html>`;

const S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';

const EMAIL = 'mikkel.rask@mail.dk';
const CPR = '140692-1234';

function xlsx(): Buffer {
  return Buffer.from(
    zipSync({
      '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
      'xl/workbook.xml': strToU8(`<workbook xmlns="${S}"><sheets/></workbook>`),
      'xl/sharedStrings.xml': strToU8(`<sst xmlns="${S}"><si><t>E-mail</t></si><si><t>${EMAIL}</t></si><si><t>Bolig</t></si></sst>`),
      'xl/worksheets/sheet1.xml': strToU8(
        `<worksheet xmlns="${S}"><sheetData>` +
          `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>` +
          `<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="inlineStr"><is><t>CPR ${CPR}</t></is></c></row>` +
          `</sheetData></worksheet>`,
      ),
    }),
  );
}

function pptx(): Buffer {
  const slide =
    `<p:sld xmlns:a="${A}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody>` +
    `<a:p><a:r><a:t>Kontakt ${EMAIL}</a:t></a:r></a:p><a:p><a:r><a:t>CPR ${CPR}</a:t></a:r></a:p>` +
    `</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
  return Buffer.from(
    zipSync({
      '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
      'ppt/presentation.xml': strToU8('<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>'),
      'ppt/slides/slide1.xml': strToU8(slide),
    }),
  );
}

/** The browser decides the file's type from its name, as it does for a file picked by the user. */
function writeTemp(name: string, bytes: Buffer): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-office-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, bytes);
  return file;
}

let harness: ExtensionHarness;
let received: Array<{ name: string; bytes: Buffer }>;

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
  await harness.configure({ nerProvider: 'off', enabled: true, imageCheckEnabled: true, officeCheckEnabled: true, defaultReplacementMode: 'placeholder' });
});

test.afterAll(async () => {
  await harness?.close();
});

test.beforeEach(async () => {
  received = [];
  const page = harness.page;
  await page.unroute('https://chatgpt.com/**').catch(() => undefined);
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

async function reviewAndConfirm(): Promise<void> {
  const page = harness.page;
  await expect(page.locator('#pg-review-overlay-host')).toHaveCount(1, { timeout: 15_000 });
  await clickExtensionShadowControl(page, '#pg-review-overlay-host', { id: 'pg-confirm-btn' });
  await expect.poll(() => received.length, { timeout: 15_000 }).toBe(1);
}

test('an Excel file comes back as an Excel file with the items replaced, and nothing is left behind', async () => {
  await harness.page.setInputFiles('#up', writeTemp('kunder.xlsx', xlsx()));
  await reviewAndConfirm();
  expect(received[0].name).toBe('kunder-anonymised.xlsx');
  const parts = unzipSync(new Uint8Array(received[0].bytes));
  const everything = Object.values(parts).map((bytes) => Buffer.from(bytes).toString('utf8')).join('\n');
  expect(everything).not.toContain(EMAIL);
  expect(everything).not.toContain(CPR);
  expect(everything).toContain('Bolig');
});

test('a PowerPoint file comes back as a PowerPoint file with the items replaced', async () => {
  await harness.page.setInputFiles('#up', writeTemp('kunde.pptx', pptx()));
  await reviewAndConfirm();
  expect(received[0].name).toBe('kunde-anonymised.pptx');
  const parts = unzipSync(new Uint8Array(received[0].bytes));
  const xml = Buffer.from(parts['ppt/slides/slide1.xml']).toString('utf8');
  expect(xml).not.toContain(EMAIL);
  expect(xml).not.toContain(CPR);
  expect(xml).toContain('Kontakt');
});

test('a native file input event cannot upload the original before review', async () => {
  await harness.page.evaluate(() => { (window as unknown as { uploadOnInput: boolean }).uploadOnInput = true; });
  await harness.page.setInputFiles('#up', writeTemp('input-event.xlsx', xlsx()));
  await expect(harness.page.locator('#pg-review-overlay-host')).toHaveCount(1, { timeout: 15_000 });
  expect(received).toHaveLength(0);
  expect(await harness.page.locator('#up').evaluate((el: HTMLInputElement) => el.files?.length)).toBe(0);
  await reviewAndConfirm();
  expect(received[0].name).toBe('input-event-anonymised.xlsx');
  const everything = Object.values(unzipSync(new Uint8Array(received[0].bytes))).map((bytes) => Buffer.from(bytes).toString('utf8')).join('\n');
  expect(everything).not.toContain(EMAIL);
  expect(everything).not.toContain(CPR);
});

/** A self-contained PDF with proportional text and a rotated copy, no external fixture or fonts. */
function textPdf(): Buffer {
  const text = `iiiiiiiiiiiiiiiiiiii ${EMAIL}`;
  const content = `BT /F1 20 Tf 1 0 0 1 30 200 Tm (${text}) Tj ET\nBT /F1 20 Tf 0 1 -1 0 350 20 Tm (${text}) Tj ET`;
  const bodies = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = [0];
  bodies.forEach((body, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out);
}

test('a blacked-out PDF covers full proportional and rotated text runs in the actual output pixels', async () => {
  const extensionPage = await harness.context.newPage();
  try {
    await extensionPage.goto(`chrome-extension://${harness.extensionId}/options/options.html`);
    const result = await extensionPage.evaluate(async (dataUrl) => chrome.runtime.sendMessage({ type: 'REDACT_PDF', payload: { requestId: 'pdf-geometry-regression', dataUrl, items: ['mikkel.rask@mail.dk'] } }), `data:application/pdf;base64,${textPdf().toString('base64')}`);
    expect(result?.payload?.status).toBe('ok');
    expect(result.payload.missed).toEqual([]);
    const pdf = Buffer.from(result.payload.dataUrl.split(',')[1], 'base64');
    expect(pdf.toString('latin1')).not.toContain(EMAIL);
    const match = /\/Filter \/DCTDecode \/Length (\d+) >>\nstream\n/.exec(pdf.toString('latin1'));
    expect(match).not.toBeNull();
    const start = match!.index + match![0].length;
    const jpeg = pdf.subarray(start, start + Number(match![1])).toString('base64');
    const ratios = await extensionPage.evaluate(async (base64) => {
      const raw = atob(base64);
      const bytes = Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const scale = 150 / 72;
      // Regions cover the email, including its leading characters. The old
      // character-proportion estimate leaves the left/leading region white.
      return [[130, 90, 150, 10], [340, 70, 10, 150]].map(([x, y, w, h]) => {
        const pixels = context.getImageData(Math.round(x * scale), Math.round(y * scale), Math.round(w * scale), Math.round(h * scale)).data;
        let dark = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 30 && pixels[i + 1] < 30 && pixels[i + 2] < 30) dark++;
        return dark / (pixels.length / 4);
      });
    }, jpeg);
    expect(ratios.every((ratio: number) => ratio > 0.98)).toBe(true);
  } finally {
    await extensionPage.close();
  }
});
