import path from 'node:path';
import { expect, test } from '@playwright/test';
import { clickExtensionShadowControl } from './closed-shadow-control';
import { ExtensionHarness } from './harness';

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
    locale: 'en-US',
    timezoneId: 'Europe/Copenhagen',
    deepDiagnostics: false,
    recordTrace: false,
  });
  await harness.configure({ nerProvider: 'off', enabled: true });
});

test.afterAll(async () => {
  await harness.close();
});

test.afterEach(async () => {
  await harness.serviceWorker.evaluate(() => {
    const state = globalThis as typeof globalThis & { __pgOriginalSend?: typeof chrome.runtime.sendMessage; __pgRelease?: () => void };
    state.__pgRelease?.();
    if (state.__pgOriginalSend) chrome.runtime.sendMessage = state.__pgOriginalSend;
    delete state.__pgOriginalSend;
    delete state.__pgRelease;
  });
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
  // Give the content script time to finish init (settings, vault, scope).
  await page.waitForTimeout(1500);
});

const BLOCKED_PROMPTS: Array<[string, string]> = [
  ['email', 'Please write to peter.hansen@hansen-tomrer.dk about the invoice'],
  ['danish CPR', 'Min CPR-nummer er 010190-1234 kan du hjælpe mig'],
  ['danish phone', 'Ring til mig på +45 20 12 34 56 i morgen'],
  ['IBAN', 'Overfør til IBAN DK50 0040 0440 1162 43 tak'],
];

for (const [label, prompt] of BLOCKED_PROMPTS) {
  test(`Enter is held for ${label} (nothing transmitted)`, async () => {
    const page = harness.page;
    await page.fill('#prompt-textarea', prompt);
    await page.press('#prompt-textarea', 'Enter');
    await expect(page.locator('#pg-review-overlay-host')).toHaveCount(1, { timeout: 10_000 });
    await page.waitForTimeout(500);
    expect(sent).toEqual([]);
    expect(await page.inputValue('#prompt-textarea')).toBe(prompt);
  });

  test(`send-button click is held for ${label} (nothing transmitted)`, async () => {
    const page = harness.page;
    await page.fill('#prompt-textarea', prompt);
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('#pg-review-overlay-host')).toHaveCount(1, { timeout: 10_000 });
    await page.waitForTimeout(500);
    expect(sent).toEqual([]);
  });
}

test('a clean prompt is sent exactly once', async () => {
  const page = harness.page;
  await page.fill('#prompt-textarea', 'Write a short poem about the sea');
  await page.press('#prompt-textarea', 'Enter');
  await expect.poll(() => sent.length, { timeout: 10_000 }).toBe(1);
  expect(sent[0]).toContain('poem about the sea');
});

test('anonymize replaces the PII before the message leaves the page', async () => {
  const page = harness.page;
  const prompt = 'Email peter.hansen@hansen-tomrer.dk and mention CPR 010190-1234';
  await page.fill('#prompt-textarea', prompt);
  await page.press('#prompt-textarea', 'Enter');
  await expect(page.locator('#pg-review-overlay-host')).toHaveCount(1, { timeout: 10_000 });
  await clickExtensionShadowControl(page, '#pg-review-overlay-host', { id: 'pg-confirm-btn' });
  await expect.poll(() => sent.length, { timeout: 10_000 }).toBe(1);
  expect(sent[0]).not.toContain('peter.hansen@hansen-tomrer.dk');
  expect(sent[0]).not.toContain('010190-1234');
  expect(sent[0]).toMatch(/\[EMAIL_1\]|@/);
});

test('a second prompt immediately after a clean send is still reviewed', async () => {
  const page = harness.page;
  await page.fill('#prompt-textarea', 'Write a poem about the sea');
  await page.press('#prompt-textarea', 'Enter');
  await expect.poll(() => sent.length).toBe(1);
  // example.com addresses are deliberately suppressed as placeholder data by the detector.
  await page.fill('#prompt-textarea', 'Please email private.person@fixture.invalid');
  await page.press('#prompt-textarea', 'Enter');
  await expect(page.locator('#pg-review-overlay-host')).toHaveCount(1);
  expect(sent).toHaveLength(1);
});

test('editing during a delayed clean scan never sends the new text', async () => {
  await harness.serviceWorker.evaluate(() => {
    const state = globalThis as typeof globalThis & {
      __pgOriginalSend?: typeof chrome.runtime.sendMessage; __pgRelease?: () => void; __pgPending?: boolean;
    };
    state.__pgOriginalSend = chrome.runtime.sendMessage;
    state.__pgPending = false;
    chrome.runtime.sendMessage = (async (message: any) => {
      if (message.type === 'OFFSCREEN_REQUEST' && message.payload.type === 'DETECT_PII') {
        state.__pgPending = true;
        await new Promise<void>(resolve => { state.__pgRelease = resolve; });
        return { type: 'PII_RESULT', payload: { requestId: message.payload.payload.requestId, spans: [] } };
      }
      return state.__pgOriginalSend!(message);
    }) as typeof chrome.runtime.sendMessage;
  });
  const page = harness.page;
  await page.fill('#prompt-textarea', 'Write a poem');
  await page.press('#prompt-textarea', 'Enter');
  await expect.poll(() => harness.serviceWorker.evaluate(() => (globalThis as any).__pgPending)).toBe(true);
  await page.fill('#prompt-textarea', 'secret@example.com');
  await harness.serviceWorker.evaluate(() => (globalThis as any).__pgRelease());
  await page.waitForTimeout(400);
  expect(sent).toEqual([]);
  expect(await page.inputValue('#prompt-textarea')).toBe('secret@example.com');
});

test('offscreen failure holds the original instead of reporting a clean scan', async () => {
  await harness.serviceWorker.evaluate(() => {
    const state = globalThis as typeof globalThis & { __pgOriginalSend?: typeof chrome.runtime.sendMessage; __pgPending?: boolean };
    state.__pgOriginalSend = chrome.runtime.sendMessage;
    state.__pgPending = false;
    chrome.runtime.sendMessage = (async (message: any) => {
      if (message.type === 'OFFSCREEN_REQUEST' && message.payload.type === 'DETECT_PII') {
        state.__pgPending = true;
        throw new Error('WASM unavailable (regression fixture)');
      }
      return state.__pgOriginalSend!(message);
    }) as typeof chrome.runtime.sendMessage;
  });
  const page = harness.page;
  await page.fill('#prompt-textarea', 'secret@example.com');
  await page.press('#prompt-textarea', 'Enter');
  await expect.poll(() => harness.serviceWorker.evaluate(() => (globalThis as any).__pgPending)).toBe(true);
  await page.waitForTimeout(400);
  expect(sent).toEqual([]);
  expect(await page.inputValue('#prompt-textarea')).toBe('secret@example.com');
});
