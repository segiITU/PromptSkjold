import { anonymizeWithVault } from '../shared/anonymizer';
import { placeholder } from '../shared/constants';
import { ENTITY_TYPES, type EntityType, type PiiSpan } from '../shared/message-types';
import {
  activeReplacement, deleteRecord, isIdentityRecord, loadIdentityVault, normalizeKey, saveIdentityVault,
  updateRecord, type IdentityRecord, type IdentityVaultData,
} from '../shared/identity-vault';
import { byteOffsetToStringIndex, stringIndexToByteOffset } from '../shared/text-offsets';
import type { VaultOperation, VaultOperationResponse, VaultOperationResult } from '../shared/vault-client';

function nextPlaceholder(data: IdentityVaultData, type: EntityType, used: Set<string>): string {
  let index = data.counters[type] ?? 0;
  let token: string;
  do {
    if (!Number.isSafeInteger(index + 1)) throw new Error('Identity counter exhausted.');
    token = placeholder(type, ++index);
  } while (used.has(token));
  data.counters[type] = index;
  return token;
}

/** Preserve available imported tokens, but never let two originals share a reverse-lookup value. */
function reconcile(data: IdentityVaultData): void {
  for (const record of data.records) {
    const match = /^\[([A-Z_]+)_(\d+)\]$/.exec(record.placeholder);
    if (match && ENTITY_TYPES.includes(match[1] as EntityType)) {
      const type = match[1] as EntityType;
      const index = Number(match[2]);
      if (Number.isSafeInteger(index)) data.counters[type] = Math.max(data.counters[type] ?? 0, index);
    }
  }
  const used = new Set<string>();
  const ids = new Set<string>();
  for (const record of data.records) {
    if (ids.has(record.id)) record.id = crypto.randomUUID();
    ids.add(record.id);
    if (used.has(record.placeholder)) record.placeholder = nextPlaceholder(data, record.entityType, used);
    used.add(record.placeholder);
    if (record.syntheticValue && used.has(record.syntheticValue)) {
      // Conflicting imported synthetic values cannot be restored unambiguously. Keep the distinct token.
      record.syntheticValue = '';
      record.replacementMode = 'placeholder';
    }
    if (record.syntheticValue) used.add(record.syntheticValue);
  }
}

function assertSpans(text: string, spans: PiiSpan[]): void {
  if (!Array.isArray(spans)) throw new Error('Invalid identity spans.');
  let previousEnd = 0;
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    if (!span || !ENTITY_TYPES.includes(span.entity_type) || !Number.isSafeInteger(span.start) ||
        !Number.isSafeInteger(span.end) || span.start < previousEnd || span.end <= span.start ||
        stringIndexToByteOffset(text, byteOffsetToStringIndex(text, span.start)) !== span.start ||
        stringIndexToByteOffset(text, byteOffsetToStringIndex(text, span.end)) !== span.end ||
        text.slice(byteOffsetToStringIndex(text, span.start), byteOffsetToStringIndex(text, span.end)) !== span.text) {
      throw new Error('Invalid identity span offsets.');
    }
    previousEnd = span.end;
  }
}

function assertPatch(patch: Parameters<typeof updateRecord>[2]): void {
  if (!patch || typeof patch !== 'object' ||
      (patch.entityType !== undefined && !ENTITY_TYPES.includes(patch.entityType)) ||
      (patch.replacementMode !== undefined && patch.replacementMode !== 'placeholder' && patch.replacementMode !== 'synthetic') ||
      (patch.syntheticValue !== undefined && typeof patch.syntheticValue !== 'string') ||
      (patch.pinned !== undefined && typeof patch.pinned !== 'boolean') ||
      (patch.notes !== undefined && typeof patch.notes !== 'string')) throw new Error('Invalid identity update.');
}

export function createVaultOperationExecutor(
  load: () => Promise<IdentityVaultData> = loadIdentityVault,
  save: (vault: IdentityVaultData) => Promise<void> = saveIdentityVault,
): (operation: VaultOperation) => Promise<VaultOperationResult> {
  // One service-worker instance owns the queue; outstanding message responses keep each operation alive.
  let queue: Promise<unknown> = Promise.resolve();
  return (operation) => {
    const task = queue.then(async (): Promise<VaultOperationResult> => {
      const vault = await load();
      reconcile(vault);
      let result: VaultOperationResult = { vault };
      switch (operation?.kind) {
        case 'anonymize': {
          if (typeof operation.text !== 'string' || !['placeholder', 'synthetic'].includes(operation.mode) ||
              !['da', 'en'].includes(operation.locale)) throw new Error('Invalid identity request.');
          assertSpans(operation.text, operation.spans);
          const anonymized = anonymizeWithVault(operation.text, operation.spans, vault, operation.mode, undefined, operation.locale);
          // New synthetic values can also collide with a custom/imported replacement. Use the token in that case.
          reconcile(vault);
          const replacements = anonymized.replacements.map((replacement, index) => ({
            ...replacement, text: activeReplacement(anonymized.recordsTouched[index], operation.mode),
          }));
          let text = '';
          let cursor = 0;
          for (const replacement of replacements) {
            text += operation.text.slice(cursor, replacement.start) + replacement.text;
            cursor = replacement.end;
          }
          text += operation.text.slice(cursor);
          result = { vault, text, replacements, entries: anonymized.recordsTouched.map(record =>
            [activeReplacement(record, operation.mode), record.originalText]) };
          break;
        }
        case 'update': {
          assertPatch(operation.patch);
          const record = vault.records.find(r => r.id === operation.id);
          if (!record) throw new Error('This identity no longer exists.');
          const type = operation.patch.entityType ?? record.entityType;
          if (vault.records.some(r => r.id !== record.id && r.entityType === type && r.normalizedKey === record.normalizedKey)) {
            throw new Error('This identity already exists in the selected category.');
          }
          if (operation.patch.syntheticValue && vault.records.some(r => r.id !== record.id &&
              (r.syntheticValue === operation.patch.syntheticValue || r.placeholder === operation.patch.syntheticValue))) {
            throw new Error('This replacement is already used by another identity.');
          }
          updateRecord(vault, operation.id, operation.patch);
          break;
        }
        case 'delete':
          deleteRecord(vault, operation.id);
          break;
        case 'clear-unpinned': {
          const count = vault.records.length;
          vault.records = vault.records.filter(r => r.pinned);
          result.removed = count - vault.records.length;
          break;
        }
        case 'import': {
          const data = operation.data as { records?: unknown; counters?: unknown } | null;
          if (!data || !Array.isArray(data.records) || !data.records.every(isIdentityRecord)) throw new Error('Invalid identity vault file.');
          if (data.counters !== undefined) {
            if (!data.counters || typeof data.counters !== 'object' || Array.isArray(data.counters)) throw new Error('Invalid identity counters.');
            for (const [type, count] of Object.entries(data.counters)) {
              if (!ENTITY_TYPES.includes(type as EntityType) || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
                throw new Error('Invalid identity counters.');
              }
              vault.counters[type as EntityType] = Math.max(vault.counters[type as EntityType] ?? 0, count);
            }
          }
          const keys = new Set(vault.records.map(r => `${r.entityType}::${r.normalizedKey}`));
          let imported = 0;
          for (const value of data.records as IdentityRecord[]) {
            const record = { ...value, normalizedKey: normalizeKey(value.originalText) };
            const key = `${record.entityType}::${record.normalizedKey}`;
            if (keys.has(key)) continue;
            keys.add(key);
            vault.records.push(record);
            imported++;
          }
          reconcile(vault);
          result.imported = imported;
          break;
        }
        default: throw new Error('Unknown identity vault operation.');
      }
      await save(vault);
      return result;
    });
    // A failed operation must not poison later requests, but its own caller still receives the failure.
    queue = task.catch(() => undefined);
    return task;
  };
}

const execute = createVaultOperationExecutor();

/** Returns true only when it has claimed the asynchronous VAULT_OPERATION response. */
export function handleVaultMessage(
  message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response: VaultOperationResponse) => void,
): boolean {
  if (!message || (message as { type?: string }).type !== 'VAULT_OPERATION') return false;
  if (sender.id && sender.id !== chrome.runtime.id) {
    sendResponse({ type: 'VAULT_ERROR', error: 'Invalid identity vault sender.' });
    return true;
  }
  void execute((message as { payload: VaultOperation }).payload)
    .then(payload => sendResponse({ type: 'VAULT_RESULT', payload }))
    .catch(error => sendResponse({ type: 'VAULT_ERROR', error: error instanceof Error ? error.message : String(error) }));
  return true;
}
