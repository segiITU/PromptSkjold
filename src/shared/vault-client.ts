import type { Replacement } from './anonymizer';
import type { IdentityVaultData, ReplacementMode, updateRecord } from './identity-vault';
import type { SyntheticLocale } from './language';
import type { PiiSpan } from './message-types';

export type VaultOperation =
  | { kind: 'anonymize'; text: string; spans: PiiSpan[]; mode: ReplacementMode; locale: SyntheticLocale }
  | { kind: 'update'; id: string; patch: Parameters<typeof updateRecord>[2] }
  | { kind: 'delete'; id: string }
  | { kind: 'clear-unpinned' }
  | { kind: 'import'; data: unknown };

export interface VaultOperationResult {
  vault: IdentityVaultData;
  text?: string;
  replacements?: Replacement[];
  entries?: Array<[string, string]>;
  imported?: number;
  removed?: number;
}

export type VaultOperationResponse =
  | { type: 'VAULT_RESULT'; payload: VaultOperationResult }
  | { type: 'VAULT_ERROR'; error: string };

/** Only the service worker allocates/persists identities. A failure must leave the prompt held. */
export async function requestVaultOperation(operation: VaultOperation): Promise<VaultOperationResult> {
  const response: VaultOperationResponse | undefined = await chrome.runtime.sendMessage({
    type: 'VAULT_OPERATION', payload: operation,
  });
  if (response?.type !== 'VAULT_RESULT') {
    throw new Error(response?.type === 'VAULT_ERROR' ? response.error : 'The identity vault did not answer.');
  }
  return response.payload;
}
