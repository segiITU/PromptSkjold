import { createVaultOperationExecutor } from '../../src/background/vault-operations';
import { emptyVaultData, upsertEntity, type IdentityVaultData } from '../../src/shared/identity-vault';
import type { PiiSpan } from '../../src/shared/message-types';
import type { VaultOperation } from '../../src/shared/vault-client';

const span = (text: string): PiiSpan => ({ start: 0, end: new TextEncoder().encode(text).length,
  text, entity_type: 'PERSON', source: 'manual', score: 1 });
const anonymize = (text: string): VaultOperation => ({ kind: 'anonymize', text, spans: [span(text)], mode: 'placeholder', locale: 'en' });

function backing(initial = emptyVaultData()) {
  let stored = structuredClone(initial);
  const load = jest.fn(async () => { await Promise.resolve(); return structuredClone(stored); });
  const save = jest.fn(async (next: IdentityVaultData) => { await Promise.resolve(); stored = structuredClone(next); });
  return { execute: createVaultOperationExecutor(load, save), load, save, stored: () => stored };
}

describe('serialized vault operations', () => {
  test('concurrent tabs allocate distinct tokens and persist both identities', async () => {
    const db = backing();
    const [alice, bob] = await Promise.all([db.execute(anonymize('Alice')), db.execute(anonymize('Bob'))]);
    expect(alice.text).toBe('[PERSON_1]');
    expect(bob.text).toBe('[PERSON_2]');
    expect(db.stored().records.map(r => r.originalText)).toEqual(['Alice', 'Bob']);
    expect(db.stored().counters.PERSON).toBe(2);
  });

  test('does not return a token before persistence completes', async () => {
    let release!: () => void;
    const saved = new Promise<void>(resolve => { release = resolve; });
    const execute = createVaultOperationExecutor(async () => emptyVaultData(), async () => saved);
    let returned = false;
    const pending = execute(anonymize('Alice')).then(() => { returned = true; });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(returned).toBe(false);
    release();
    await pending;
    expect(returned).toBe(true);
  });

  test('a failed save does not emit a token or poison later operations', async () => {
    const db = backing();
    db.save.mockRejectedValueOnce(new Error('quota'));
    await expect(db.execute(anonymize('Alice'))).rejects.toThrow('quota');
    expect(db.stored().records).toHaveLength(0);
    const bob = await db.execute(anonymize('Bob'));
    expect(bob.text).toBe('[PERSON_1]');
    expect(db.stored().records.map(r => r.originalText)).toEqual(['Bob']);
  });

  test('an allocation after deletion does not resurrect a stale tab record or reuse its token', async () => {
    const db = backing();
    const alice = await db.execute(anonymize('Alice'));
    await Promise.all([
      db.execute({ kind: 'delete', id: alice.vault.records[0].id }),
      db.execute(anonymize('Bob')),
    ]);
    expect(db.stored().records.map(r => r.originalText)).toEqual(['Bob']);
    expect(db.stored().records[0].placeholder).toBe('[PERSON_2]');
  });

  test('edits operate on the latest state and preserve concurrent allocations', async () => {
    const db = backing();
    const alice = await db.execute(anonymize('Alice'));
    await Promise.all([
      db.execute(anonymize('Bob')),
      db.execute({ kind: 'update', id: alice.vault.records[0].id, patch: { notes: 'pinned note', pinned: true } }),
    ]);
    expect(db.stored().records).toHaveLength(2);
    expect(db.stored().records[0]).toMatchObject({ originalText: 'Alice', pinned: true, notes: 'pinned note' });
    const cleared = await db.execute({ kind: 'clear-unpinned' });
    expect(cleared.removed).toBe(1);
    expect(db.stored().records.map(r => r.originalText)).toEqual(['Alice']);
    expect((await db.execute(anonymize('Carol'))).text).toBe('[PERSON_3]');
  });

  test('import reconciles duplicate placeholders, IDs and synthetics without replacing existing identities', async () => {
    const initial = emptyVaultData();
    const alice = upsertEntity(initial, span('Alice')).record;
    const other = emptyVaultData();
    const bob = upsertEntity(other, span('Bob')).record;
    bob.id = alice.id;
    expect(bob.placeholder).toBe(alice.placeholder);
    expect(bob.syntheticValue).toBe(alice.syntheticValue);
    const db = backing(initial);
    const imported = await db.execute({ kind: 'import', data: other });
    expect(imported.imported).toBe(1);
    const records = db.stored().records;
    expect(records[0]).toEqual(alice);
    expect(records[1].placeholder).toBe('[PERSON_2]');
    expect(records[1].id).not.toBe(alice.id);
    expect(records[1].syntheticValue).toBe('');
    expect(records[1].replacementMode).toBe('placeholder');
    expect((await db.execute({ kind: 'import', data: other })).imported).toBe(0);
  });

  test('import preserves counter high watermarks even for deleted records', async () => {
    const data = emptyVaultData();
    data.counters.PERSON = 90;
    const db = backing();
    await db.execute({ kind: 'import', data });
    expect((await db.execute(anonymize('Alice'))).text).toBe('[PERSON_91]');
  });

  test('malformed import fails atomically rather than persisting partial records', async () => {
    const data = emptyVaultData();
    upsertEntity(data, span('Alice'));
    const db = backing();
    await expect(db.execute({ kind: 'import', data: { records: [...data.records, { originalText: 'Broken' }] } }))
      .rejects.toThrow('Invalid identity vault');
    expect(db.save).not.toHaveBeenCalled();
    expect(db.stored().records).toHaveLength(0);
  });

  test('custom replacement edits cannot create ambiguous reverse lookups', async () => {
    const db = backing();
    const alice = await db.execute(anonymize('Alice'));
    const bob = await db.execute(anonymize('Bob'));
    await expect(db.execute({ kind: 'update', id: bob.vault.records[1].id,
      patch: { syntheticValue: alice.vault.records[0].syntheticValue } })).rejects.toThrow('already used');
  });

  test('new generated synthetics conflicting with imported edits fall back to a distinct token', async () => {
    const initial = emptyVaultData();
    const existing = upsertEntity(initial, span('Alice')).record;
    const preview = emptyVaultData();
    upsertEntity(preview, span('Alice'));
    existing.syntheticValue = upsertEntity(preview, span('Bob')).record.syntheticValue;
    const db = backing(initial);
    const operation = anonymize('Bob');
    if (operation.kind !== 'anonymize') throw new Error('invalid fixture');
    operation.mode = 'synthetic';
    const result = await db.execute(operation);
    expect(result.text).toBe('[PERSON_2]');
    expect(result.replacements?.[0].text).toBe('[PERSON_2]');
    expect(result.entries).toEqual([['[PERSON_2]', 'Bob']]);
  });
});
