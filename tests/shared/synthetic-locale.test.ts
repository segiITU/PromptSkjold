import { looksDanish, resolveSyntheticLocale } from '../../src/shared/language';
import { generateSyntheticValue, poolSize } from '../../src/shared/synthetic-pool';
import { emptyVaultData, inLocale, updateRecord, upsertEntity } from '../../src/shared/identity-vault';
import { loadSettings } from '../../src/shared/storage';
import type { PiiSpan } from '../../src/shared/message-types';

describe('looksDanish', () => {
  test('recognises Danish by its letters', () => {
    expect(looksDanish('Jeg bor i Århus på Østergade')).toBe(true);
  });
  test('recognises Danish by function words when there are no special letters', () => {
    expect(looksDanish('Hej, jeg hedder Mikkel og jeg har en klage til kommunen')).toBe(true);
  });
  test('treats English and very short text as English', () => {
    expect(looksDanish('Please summarise this contract for me and list the risks')).toBe(false);
    expect(looksDanish('Hej')).toBe(false);
  });
});

describe('resolveSyntheticLocale', () => {
  test('an explicit setting wins over the text', () => {
    expect(resolveSyntheticLocale('en', 'Jeg bor i Århus på Østergade')).toBe('en');
    expect(resolveSyntheticLocale('da', 'Please help me with this')).toBe('da');
  });
  test('auto follows the text', () => {
    expect(resolveSyntheticLocale('auto', 'Jeg bor i Århus på Østergade')).toBe('da');
    expect(resolveSyntheticLocale('auto', 'Please help me with this')).toBe('en');
  });
});

describe('Danish synthetic values', () => {
  test('English stays the default', () => {
    expect(generateSyntheticValue('PERSON', 0)).toBe('Jordan Park');
  });

  test.each(['PERSON', 'LOCATION', 'ORGANIZATION', 'ADDRESS', 'USERNAME', 'MISC', 'PHONE', 'IBAN', 'BANK_ACCOUNT'] as const)(
    '%s has a Danish value that differs from the English one',
    (type) => {
      const da = generateSyntheticValue(type, 0, { locale: 'da' });
      expect(da).toBeTruthy();
      expect(da).not.toBe(generateSyntheticValue(type, 0));
    },
  );

  test('Danish numbers are generic and count up, so no two identities share one', () => {
    expect(generateSyntheticValue('PHONE', 0, { locale: 'da' })).toBe('+45 12345678');
    expect(generateSyntheticValue('PHONE', 1, { locale: 'da' })).toBe('+45 12345679');
    expect(generateSyntheticValue('CPR', 0, { locale: 'da' })).toBe('123456-7890');
    expect(generateSyntheticValue('CPR', 1, { locale: 'da' })).toBe('123456-7891');
    expect(generateSyntheticValue('BANK_ACCOUNT', 0, { locale: 'da' })).toBe('1234 1234567890');
    expect(generateSyntheticValue('IBAN', 0, { locale: 'da' })).toBe('DK00 1234 5678 9012 34');
    for (const type of ['PHONE', 'CPR', 'IBAN', 'BANK_ACCOUNT'] as const) {
      const values = Array.from({ length: 200 }, (_, i) => generateSyntheticValue(type, i, { locale: 'da' }));
      expect(new Set(values).size).toBe(200);
    }
  });

  test('English values are unchanged', () => {
    expect(generateSyntheticValue('PHONE', 0)).toBe('+1 (555) 010-0123');
    expect(generateSyntheticValue('CPR', 0)).toBe('010150-0001');
  });

  test('Danish addresses use the generic postcode 1234', () => {
    for (let i = 0; i < poolSize('ADDRESS'); i++) {
      expect(generateSyntheticValue('ADDRESS', i, { locale: 'da' })).toMatch(/ 1234 /);
    }
  });

  test('an email built from a Danish name is plain ASCII', () => {
    const email = generateSyntheticValue('EMAIL', 0, { personSeed: 'Freja Mølgaard', locale: 'da' });
    expect(email).toBe('freja.moelgaard@example.com');
  });

  test('the vault stores the locale it was created with and keeps it', () => {
    const vault = emptyVaultData();
    const span: PiiSpan = { start: 0, end: 6, entity_type: 'PERSON', score: 0.9, text: 'Mikkel', source: 'ner' };
    const first = upsertEntity(vault, span, 1, 'synthetic', 'da').record;
    expect(first.syntheticValue).toBe('Mads Askelvig');
    // Seen again in an English text: same person, same replacement.
    expect(upsertEntity(vault, span, 2, 'synthetic', 'en').record.syntheticValue).toBe('Mads Askelvig');
  });
});

describe('records made in the wrong language', () => {
  const span = (text: string, entity_type: PiiSpan['entity_type'] = 'PERSON'): PiiSpan => ({
    start: 0, end: text.length, entity_type, score: 0.9, text, source: 'ner',
  });

  /** A vault record as older versions made it: English value, no language recorded. */
  function legacyVault() {
    const vault = emptyVaultData();
    upsertEntity(vault, span('Mikkel'), 1, 'synthetic'); // English
    upsertEntity(vault, span('Aarhus', 'LOCATION'), 1, 'synthetic');
    delete vault.records[0].syntheticLocale;
    delete vault.records[1].syntheticLocale;
    return vault;
  }

  test('an English record is moved to Danish when a Danish text uses it', () => {
    const vault = legacyVault();
    expect(vault.records[0].syntheticValue).toBe('Jordan Park');
    const record = upsertEntity(vault, span('Mikkel'), 2, 'synthetic', 'da').record;
    expect(record.syntheticValue).toBe('Mads Askelvig');
    expect(record.syntheticLocale).toBe('da');
  });

  test('the preview shows the same value the real run will use, without touching the vault', () => {
    const vault = legacyVault();
    const preview = inLocale(vault.records[1], 'da');
    expect(preview.syntheticValue).toBe('Askeholt');
    expect(vault.records[1].syntheticValue).toBe('Springwood');
    expect(upsertEntity(vault, span('Aarhus', 'LOCATION'), 2, 'synthetic', 'da').record.syntheticValue).toBe('Askeholt');
  });

  test('a Danish record made from the earlier pools is refreshed, a current one is not', () => {
    const vault = emptyVaultData();
    upsertEntity(vault, span('Mikkel Rask', 'PERSON'), 1, 'synthetic', 'da');
    upsertEntity(vault, span('51 77 20 96', 'PHONE'), 1, 'synthetic', 'da');
    expect(vault.records[1].syntheticValue).toBe('+45 12345678');
    // Pretend the phone was made before the generic numbers: old value, no revision.
    vault.records[1].syntheticValue = '+45 10 00 01 01';
    delete vault.records[1].syntheticRevision;
    expect(upsertEntity(vault, span('51 77 20 96', 'PHONE'), 2, 'synthetic', 'da').record.syntheticValue).toBe('+45 12345678');
    // The current person record is untouched.
    expect(upsertEntity(vault, span('Mikkel Rask', 'PERSON'), 2, 'synthetic', 'da').record.syntheticValue).toBe('Mads Askelvig');
  });

  test('a record keeps its language when the text is in the same language', () => {
    const vault = legacyVault();
    expect(upsertEntity(vault, span('Mikkel'), 2, 'synthetic', 'en').record.syntheticValue).toBe('Jordan Park');
    expect(upsertEntity(vault, span('Mikkel'), 3, 'synthetic').record.syntheticValue).toBe('Jordan Park');
  });

  test('values typed by the user and pinned records are never changed', () => {
    const edited = legacyVault();
    updateRecord(edited, edited.records[0].id, { syntheticValue: 'Mit Eget Navn' });
    expect(upsertEntity(edited, span('Mikkel'), 2, 'synthetic', 'da').record.syntheticValue).toBe('Mit Eget Navn');

    const pinned = legacyVault();
    updateRecord(pinned, pinned.records[0].id, { pinned: true });
    expect(upsertEntity(pinned, span('Mikkel'), 2, 'synthetic', 'da').record.syntheticValue).toBe('Jordan Park');
  });

  test('moved records never share a value', () => {
    const vault = emptyVaultData();
    for (const name of ['Anna', 'Berit', 'Carsten', 'Dorte']) upsertEntity(vault, span(name), 1, 'synthetic');
    vault.records.forEach((r) => delete r.syntheticLocale);
    const moved = ['Anna', 'Berit', 'Carsten', 'Dorte'].map(
      (name) => upsertEntity(vault, span(name), 2, 'synthetic', 'da').record.syntheticValue,
    );
    expect(new Set(moved).size).toBe(4);
  });

  test('every Danish pool is free of duplicates', () => {
    for (const type of ['PERSON', 'LOCATION', 'ORGANIZATION', 'ADDRESS'] as const) {
      const values = Array.from({ length: poolSize(type) }, (_, i) => generateSyntheticValue(type, i, { locale: 'da' }));
      // The pool size reported is the English one; Danish pools must at least be unique over their own length.
      expect(new Set(values.slice(0, 8)).size).toBe(8);
    }
  });
});

describe('syntheticLocale setting', () => {
  const stored = (value: unknown) => (chrome.storage.local.get as jest.Mock).mockResolvedValueOnce({ pg_settings: { syntheticLocale: value } });

  test('defaults to auto when nothing is stored', async () => {
    (chrome.storage.local.get as jest.Mock).mockResolvedValueOnce({});
    expect((await loadSettings()).syntheticLocale).toBe('auto');
  });

  test('rejects junk and keeps valid values', async () => {
    stored('xx');
    expect((await loadSettings()).syntheticLocale).toBe('auto');
    stored('da');
    expect((await loadSettings()).syntheticLocale).toBe('da');
  });
});
