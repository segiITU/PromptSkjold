import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { expect, test, type Page } from '@playwright/test';
import { clickExtensionShadowControl } from './closed-shadow-control';
import { ExtensionHarness } from './harness';

/**
 * The real built extension (dist) with the SYNTHETIC example files from tests/fixtures/office, on a LOCAL mock chat
 * page only (route-fulfilled at https://chatgpt.com/; nothing leaves the machine, no logins). Walks the switch:
 * off -> notice and pass-through, "Slå til" -> setting on, on -> review overlay listing what was found, replace ->
 * the file that reaches the page is anonymised and the fixture on disk is unchanged. Opt-in:
 *   UI_SHOTS_DIR=<dir> BIG_PPTX=<path to syntetisk-stor.pptx, optional> npx playwright test --config e2e/live/playwright.screens.config.ts office-fixtures
 * Screenshots go to <dir>/office-*.png and a report to <dir>/office-report.json.
 */
const OUT = process.env.UI_SHOTS_DIR ?? '';
test.skip(!OUT, 'set UI_SHOTS_DIR');
test.setTimeout(420_000);

const FIXTURES = path.resolve('tests/fixtures/office');
const FILES = [
  { key: 'xlsx', file: path.join(FIXTURES, 'syntetisk-testdata.xlsx') },
  { key: 'pptx', file: path.join(FIXTURES, 'syntetisk-testdata.pptx') },
  ...(process.env.BIG_PPTX ? [{ key: 'pptx-big', file: path.resolve(process.env.BIG_PPTX) }] : []),
];
const sha = (f: string) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const MOCK_PAGE = `<!doctype html><html><body style="font-family:sans-serif"><main><h1>Chat</h1><input type="file" id="up" multiple></main>
<script>
  async function upload(e) {
    if (e.type === 'input') return;
    for (const file of e.target.files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let bin = '';
      for (const b of bytes) bin += String.fromCharCode(b);
      await fetch('/backend-api/upload', { method: 'POST', body: JSON.stringify({ name: file.name, b64: btoa(bin) }) });
    }
  }
  document.getElementById('up').addEventListener('change', upload);
</script></body></html>`;

let harness: ExtensionHarness;
let received: Array<{ name: string; bytes: Buffer }> = [];
const report: Record<string, unknown> = {};

test.beforeAll(async () => {
  harness = await ExtensionHarness.launch({ buildDir: path.resolve('dist'), headless: true, viewport: { width: 1280, height: 800 }, locale: 'da-DK', timezoneId: 'Europe/Copenhagen', deepDiagnostics: false, recordTrace: false });
  await harness.configure({ nerProvider: 'transformers', enabled: true, imageCheckEnabled: true, officeCheckEnabled: false, defaultReplacementMode: 'placeholder' });
  await harness.serviceWorker.evaluate(async () => chrome.storage.local.set({ pk_ui_language: 'da' }));
  fs.mkdirSync(OUT, { recursive: true });
});
test.afterAll(async () => {
  fs.writeFileSync(path.join(OUT, 'office-report.json'), JSON.stringify(report, null, 2));
  await harness?.close();
});

async function openPage(): Promise<Page> {
  received = [];
  const page = await harness.context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
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
  return page;
}

interface CdpNode { nodeName?: string; nodeType?: number; nodeValue?: string; attributes?: string[]; children?: CdpNode[]; shadowRoots?: CdpNode[] }

/** What the review overlay lists (closed shadow DOM, read through CDP): category, value and replacement per finding. */
async function overlayFindings(page: Page): Promise<string[]> {
  const client = await page.context().newCDPSession(page);
  try {
    await client.send('DOM.enable');
    const { root } = (await client.send('DOM.getDocument', { depth: 0 })) as { root: { nodeId: number } };
    const { nodeId } = (await client.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#pg-review-overlay-host' })) as { nodeId: number };
    const { node } = (await client.send('DOM.describeNode', { nodeId, depth: -1, pierce: true })) as { node: CdpNode };
    const attr = (n: CdpNode, name: string) => {
      const a = n.attributes ?? [];
      const i = a.indexOf(name);
      return i >= 0 ? a[i + 1] : '';
    };
    const text = (n: CdpNode): string => (n.nodeType === 3 ? (n.nodeValue ?? '') : n.nodeName === 'OPTION' ? '' : [...(n.children ?? [])].map(text).join(''));
    const out: string[] = [];
    const visit = (n: CdpNode): void => {
      const cls = attr(n, 'class');
      if (n.nodeName === 'LI' && /\bpk-fi\b/.test(cls)) {
        const find = (m: CdpNode, c: string): CdpNode | null => {
          if (new RegExp(`\\b${c}\\b`).test(attr(m, 'class'))) return m;
          for (const k of m.children ?? []) {
            const r = find(k, c);
            if (r) return r;
          }
          return null;
        };
        const val = find(n, 'pk-fi-val');
        const ph = find(n, 'pk-tag');
        out.push(`${attr(n, 'data-cat')}|${val ? text(val).trim() : ''}|${ph ? text(ph).trim() : ''}`);
      }
      for (const c of n.children ?? []) visit(c);
      for (const s of n.shadowRoots ?? []) visit(s);
    };
    visit(node);
    return out;
  } finally {
    await client.detach();
  }
}

for (const { key, file } of FILES) {
  test(`${key}: off -> notice and pass-through; "Slå til"; on -> review and anonymised result`, async () => {
    const before = sha(file);
    const info: Record<string, unknown> = { file: path.basename(file), bytes: fs.statSync(file).size };
    report[key] = info;

    // 1. switch OFF (the default)
    await harness.configure({ officeCheckEnabled: false });
    let page = await openPage();
    await page.setInputFiles('#up', file);
    await expect(page.locator('#pg-office-notice-host')).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator('#pg-review-overlay-host')).toHaveCount(0);
    await expect.poll(() => received.length, { timeout: 30_000 }).toBe(1);
    info.offPassedThroughUnchanged = Buffer.compare(received[0].bytes, fs.readFileSync(file)) === 0 && received[0].name === path.basename(file);
    await page.screenshot({ path: path.join(OUT, `office-${key}-1-notice.png`) });

    // 2. "Slå til" writes the setting
    await clickExtensionShadowControl(page, '#pg-office-notice-host', { id: 'pg-office-enable-btn' });
    await page.waitForTimeout(600);
    info.settingAfterTurnOn = await harness.serviceWorker.evaluate(async () => (await chrome.storage.local.get('pg_settings')).pg_settings?.officeCheckEnabled);
    await page.screenshot({ path: path.join(OUT, `office-${key}-2-turned-on.png`) });
    await page.close();

    // 3. switch ON: review, then replace
    page = await openPage();
    const t0 = Date.now();
    await page.setInputFiles('#up', file);
    await expect(page.locator('#pg-review-overlay-host')).toHaveCount(1, { timeout: 180_000 });
    info.msToOverlay = Date.now() - t0;
    await page.waitForTimeout(1500);
    info.findings = await overlayFindings(page);
    await page.screenshot({ path: path.join(OUT, `office-${key}-3-overlay.png`) });
    await clickExtensionShadowControl(page, '#pg-review-overlay-host', { id: 'pg-confirm-btn' });
    await expect.poll(() => received.length, { timeout: 120_000 }).toBe(1);
    info.receivedName = received[0].name;
    const parts = unzipSync(new Uint8Array(received[0].bytes));
    const everything = Object.values(parts).map((b) => Buffer.from(b).toString('utf8')).join('\n');
    const probes = ['anna.testesen@syntetisk-firma.test', 'bjarne.madsen@syntetisk-firma.test', 'kontakt@ermias.ai', '+45 28 71 40 93', '+45 31 22 45 67', '61 23 45 67', '+45 40 12 34 56', '111111-1111', '150385-4321', '070790-1234', 'DK50 0040 0440 1162 43', 'konto 9876543210', '192.168.10.24', 'Anna Testesen', 'Bjarne Madsen', 'Camilla Bjerregaard', 'Testvej 12', '12-04-1985', '15-03-1985', 'Ordrenummer 12345678'];
    info.stillInReceivedFile = probes.filter((p) => everything.includes(p));
    info.originalUnchanged = sha(file) === before;
    await page.close();
    await harness.configure({ officeCheckEnabled: false });
  });
}
