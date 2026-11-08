import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { ExtensionHarness } from './harness';

/**
 * Real-Chromium check of "Add a site".
 *
 * Chrome's permission prompt cannot be clicked by automation, so the test
 * build is a copy of dist/ whose manifest already grants https://*\/* at
 * install. Everything after the prompt is the real code path: the service
 * worker registers the content scripts, records the status, and a made-up
 * chat site is then protected like the built-in ones.
 */

const MOCK_PAGE = `<!doctype html><html><body>
<form id="f"><textarea id="prompt" style="width:500px;height:80px"></textarea>
<button type="submit">Send</button></form>
<script>
  document.getElementById('f').addEventListener('submit', (e) => {
    e.preventDefault();
    fetch('/send', { method: 'POST', body: document.getElementById('prompt').value });
  });
  document.getElementById('prompt').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('f').requestSubmit(); }
  });
</script></body></html>`;

const PROMPT = 'Please write to peter.hansen@hansen-tomrer.dk about the invoice';

let harness: ExtensionHarness;
let sent: string[];
let buildDir: string;

test.beforeAll(async () => {
  buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-user-sites-'));
  fs.cpSync(path.resolve('dist'), buildDir, { recursive: true });
  const manifestPath = path.join(buildDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.host_permissions.push('https://*/*');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));

  harness = await ExtensionHarness.launch({
    buildDir,
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
  fs.rmSync(buildDir, { recursive: true, force: true });
});

async function routeChatDk(): Promise<void> {
  sent = [];
  await harness.context.route('https://chat.dk/**', async (route) => {
    if (new URL(route.request().url()).pathname === '/send') {
      sent.push(route.request().postData() ?? '');
      await route.fulfill({ status: 200, body: '{}' });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'text/html', body: MOCK_PAGE });
  });
}

async function statusOf(host: string): Promise<unknown> {
  return harness.serviceWorker.evaluate(async (h) => {
    const result = await chrome.storage.local.get('pg_user_site_status');
    return result.pg_user_site_status?.[h];
  }, host);
}

test('an unlisted site is not protected', async () => {
  await routeChatDk();
  const page = await harness.context.newPage();
  await page.goto('https://chat.dk/');
  await page.fill('#prompt', PROMPT);
  await page.press('#prompt', 'Enter');
  await page.waitForTimeout(1500);
  await expect(page.locator('#pg-review-overlay-host')).toHaveCount(0);
  expect(sent).toEqual([PROMPT]);
  await page.close();
});

test('adding a site in the options page shows a spinner, then a green check', async () => {
  const options = await harness.context.newPage();
  await options.goto(`chrome-extension://${harness.extensionId}/options/options.html`);
  const card = options.locator('#sites-section');
  await expect(card).toContainText('Dine egne sider');

  await card.getByPlaceholder('fx chat.dk').fill('co.uk');
  await card.locator('form').getByRole('button', { name: 'Tilføj' }).click();
  await expect(card.getByRole('alert')).toContainText('for bred');

  await card.getByPlaceholder('fx chat.dk').fill('https://www.chat.dk/login');
  await card.locator('form').getByRole('button', { name: 'Tilføj' }).click();

  const row = card.locator('.sites li', { hasText: 'chat.dk' }).filter({ hasNotText: 'Indbygget' });
  await expect(row).toContainText('PromptSkjold er aktiv på siden', { timeout: 15_000 });
  await expect(row.getByRole('img', { name: 'OK' })).toBeVisible();
  expect(await statusOf('chat.dk')).toEqual({ state: 'active' });
  await options.close();
});

test('an added site is protected: PII is held and nothing is sent', async () => {
  await routeChatDk();
  const page = await harness.context.newPage();
  await page.goto('https://chat.dk/');
  await page.waitForTimeout(1500);
  await page.fill('#prompt', PROMPT);
  await page.press('#prompt', 'Enter');
  await expect(page.locator('#pg-review-overlay-host')).toHaveCount(1, { timeout: 10_000 });
  await page.waitForTimeout(500);
  expect(sent).toEqual([]);
  await page.close();
});

test('removing the site stops the protection again', async () => {
  const options = await harness.context.newPage();
  await options.goto(`chrome-extension://${harness.extensionId}/options/options.html`);
  const row = options.locator('#sites-section .sites li', { hasText: 'chat.dk' }).filter({ hasNotText: 'Indbygget' });
  await row.getByRole('button', { name: 'Fjern' }).click();
  await expect(row).toHaveCount(0);
  await options.close();

  await expect.poll(async () => harness.serviceWorker.evaluate(async () => {
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    return scripts.filter((script) => script.id.startsWith('pg-user-')).length;
  })).toBe(0);

  await routeChatDk();
  const page = await harness.context.newPage();
  await page.goto('https://chat.dk/');
  await page.waitForTimeout(1000);
  await page.fill('#prompt', PROMPT);
  await page.press('#prompt', 'Enter');
  await page.waitForTimeout(1500);
  await expect(page.locator('#pg-review-overlay-host')).toHaveCount(0);
  expect(sent).toEqual([PROMPT]);
  await page.close();
});
