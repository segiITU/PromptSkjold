import type { DetectionFailedResponse, NerCoverage, PiiResultResponse } from './message-types';
import { t } from './i18n/core';

export function coverageNotes(coverage?: NerCoverage): string[] {
  return coverage?.mode === 'partial' ? [t('scan.partialCoverage')] : [];
}

export function detectionFailed(requestId: string, error: unknown): DetectionFailedResponse {
  return { type: 'DETECTION_FAILED', payload: { requestId, message: error instanceof Error ? error.message : String(error) } };
}

/** Validate the boundary, including legacy error-bearing responses during an extension update. */
export function requirePiiResult(value: unknown): PiiResultResponse {
  const response = value as (PiiResultResponse & { error?: string }) | DetectionFailedResponse | undefined;
  if (response?.type === 'DETECTION_FAILED') throw new Error(response.payload.message);
  if (response && 'error' in response && response.error) throw new Error(response.error);
  if (response?.type !== 'PII_RESULT' || !Array.isArray(response.payload?.spans)) {
    throw new Error('Invalid response from detection pipeline');
  }
  return response;
}
