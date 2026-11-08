import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { IdentityVaultData } from '../../src/shared/identity-vault';
import type { VaultOperationResponse } from '../../src/shared/vault-client';
import { ExtensionHarness } from './harness';

async function allocate(page: Page, text: string) {
  return page.evaluate(async (original) => {
    const response = await chrome.runtime.sendMessage({ type: 'VAULT_OPERATION', payload: {
      kind: 'anonymize', text: original,
      spans: [{ start: 0, end: new TextEncoder().encode(original).length,
        text: original, entity_type: 'PERSON', score: 1, source: 'manual' }],
      mode: 'placeholder', locale: 'en',
    } }) as VaultOperationResponse;
    if (response.type !== 'VAULT_RESULT') throw new Error(response.error);
    // Read immediately after acknowledgement: no token may be returned ahead of its storage write.
    const stored = await chrome.storage.local.get('pg_identity_vault');
    const vault = stored.pg_identity_vault as IdentityVaultData;
    return { text: response.payload.text,
      persisted: vault.records.some(record => record.originalText === original && record.placeholder === response.payload.text) };
  }, text);
}

test('separate extension pages allocate concurrently without losing identities or reusing tokens', async () => {
  const harness = await ExtensionHarness.launch({
    buildDir: path.resolve('dist'), headless: true, viewport: { width: 1200, height: 800 },
    locale: 'en-US', timezoneId: 'Europe/Copenhagen', deepDiagnostics: false, recordTrace: false,
  });
  try {
    await harness.configure({ nerProvider: 'off', autoWarmLocalAiOnActiveSupportedPage: false });
    const first = harness.page;
    const second = await harness.context.newPage();
    const optionsUrl = `chrome-extension://${harness.extensionId}/options/options.html`;
    await Promise.all([first.goto(optionsUrl), second.goto(optionsUrl)]);
    const [alice, bob] = await Promise.all([allocate(first, 'Aster Fictional'), allocate(second, 'Bracken Fictional')]);

    expect(alice.persisted).toBe(true);
    expect(bob.persisted).toBe(true);
    expect(alice.text).not.toBe(bob.text);
    const vault = await harness.serviceWorker.evaluate(async () =>
      (await chrome.storage.local.get('pg_identity_vault')).pg_identity_vault as IdentityVaultData);
    expect(vault.records.map(record => record.originalText).sort()).toEqual(['Aster Fictional', 'Bracken Fictional']);
    expect(new Set(vault.records.map(record => record.placeholder)).size).toBe(2);
    expect(vault.counters.PERSON).toBe(2);

    // An independently exported vault may have allocated the same ID, token and synthetic value.
    const collision = { ...vault.records[0], originalText: 'Cedar Fictional', normalizedKey: 'cedar fictional' };
    const imported = await second.evaluate(async (record) => {
      const response = await chrome.runtime.sendMessage({ type: 'VAULT_OPERATION', payload: {
        kind: 'import', data: { version: 1, records: [record], counters: { PERSON: 1 } },
      } }) as VaultOperationResponse;
      if (response.type !== 'VAULT_RESULT') throw new Error(response.error);
      const stored = await chrome.storage.local.get('pg_identity_vault');
      return { imported: response.payload.imported, vault: stored.pg_identity_vault as IdentityVaultData };
    }, collision);
    expect(imported.imported).toBe(1);
    expect(imported.vault.records).toHaveLength(3);
    expect(new Set(imported.vault.records.map(record => record.placeholder)).size).toBe(3);
    expect(new Set(imported.vault.records.map(record => record.id)).size).toBe(3);
    const cedar = imported.vault.records.find(record => record.originalText === 'Cedar Fictional')!;
    expect(cedar.placeholder).not.toBe(collision.placeholder);
    expect(cedar.syntheticValue).toBe('');
    expect(cedar.replacementMode).toBe('placeholder');
    for (const original of vault.records) {
      expect(imported.vault.records.find(record => record.id === original.id)).toEqual(original);
    }
    expect((await allocate(first, 'Cedar Fictional')).text).toBe(cedar.placeholder);
  } finally {
    await harness.close();
  }
});
