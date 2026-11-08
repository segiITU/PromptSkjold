import path from 'node:path';
import { expect, test } from '@playwright/test';
import { emptyVaultData, upsertEntity } from '../../src/shared/identity-vault';
import { clickExtensionShadowControl } from './closed-shadow-control';
import { ExtensionHarness } from './harness';

const ORIGINAL = 'Alice Private';
const MOCK_PAGE = `<!doctype html><html><body><main>
  <textarea id="prompt-textarea"></textarea>
  <div data-message-author-role="assistant"><provider-artifact>Reply to [PERSON_1].</provider-artifact></div>
  <button id="provider-copy" type="button">Copy reply</button>
</main><script>
  window.providerObserved = [];
  window.addEventListener('message', event => {
    try { window.providerObserved.push(JSON.stringify(event.data)); } catch {}
  });
  new MutationObserver(records => {
    for (const record of records) {
      window.providerObserved.push(record.target.textContent || '');
      for (const node of record.addedNodes) window.providerObserved.push(node.textContent || '');
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  customElements.define('provider-artifact', class extends HTMLElement {
    connectedCallback() { window.providerObserved.push(this.textContent); }
  });
  document.getElementById('provider-copy').addEventListener('click', () => {
    navigator.clipboard.writeText('Reply to [PERSON_1].');
  });
</script></body></html>`;

let harness: ExtensionHarness;

test.beforeAll(async () => {
  harness = await ExtensionHarness.launch({
    buildDir: path.resolve('dist'), headless: true, viewport: { width: 1200, height: 800 },
    locale: 'en-US', timezoneId: 'Europe/Copenhagen', deepDiagnostics: false, recordTrace: false,
  });
  await harness.configure({ enabled: true, nerProvider: 'off', identityVaultEnabled: true, clipboardInterceptEnabled: true });
  const vault = emptyVaultData();
  upsertEntity(vault, { start: 0, end: ORIGINAL.length, text: ORIGINAL, entity_type: 'PERSON', score: 1, source: 'manual' });
  await harness.serviceWorker.evaluate(async value => {
    await chrome.storage.local.set({ pg_identity_vault: value });
  }, vault);
});

test.afterAll(async () => { await harness.close(); });

test.beforeEach(async () => {
  await harness.page.unroute('https://chatgpt.com/**').catch(() => undefined);
  await harness.page.route('https://chatgpt.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: MOCK_PAGE }));
  await harness.page.goto('https://chatgpt.com/');
  await expect(harness.page.locator('.pg-deanon-host')).toHaveCount(1);
});

async function providerView(): Promise<string> {
  return harness.page.evaluate(() => JSON.stringify({
    text: document.body.textContent,
    markup: document.body.innerHTML,
    messagesAndMutations: (window as unknown as { providerObserved: string[] }).providerObserved,
  }));
}

test('Reveal and banner Copy keep originals out of provider DOM and events', async () => {
  const page = harness.page;
  await clickExtensionShadowControl(page, '.pg-deanon-host', { id: 'pg-reveal-btn' });
  await expect(page.locator('.pg-deanon-reveal-host')).toBeVisible();
  expect(await page.evaluate(() => document.querySelector('.pg-deanon-reveal-host')!.shadowRoot)).toBeNull();
  expect(await providerView()).not.toContain(ORIGINAL);
  await clickExtensionShadowControl(page, '.pg-deanon-host', { id: 'pg-copy-btn' });
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`Reply to ${ORIGINAL}.`);
  await clickExtensionShadowControl(page, '.pg-deanon-host', { id: 'pg-reveal-btn' });
  await expect(page.locator('.pg-deanon-reveal-host')).toHaveCount(0);
  expect(await providerView()).not.toContain(ORIGINAL);
});

test('website Copy followed by Replace uses isolated clipboard without broadcasting originals', async () => {
  const page = harness.page;
  await page.click('#provider-copy');
  await expect(page.locator('#pg-clipboard-toast-host')).toHaveCount(1);
  await clickExtensionShadowControl(page, '#pg-clipboard-toast-host', { id: 'pg-clipboard-replace-btn' });
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`Reply to ${ORIGINAL}.`);
  expect(await providerView()).not.toContain(ORIGINAL);
});
