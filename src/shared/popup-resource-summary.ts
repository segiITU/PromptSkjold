import { isCpuFallback } from './constants';
import { t } from './i18n/core';
import type { NerStatus, Settings, SystemCompatibilityStatus } from './message-types';

export type ResourceSummaryTone = 'ok' | 'warning' | 'critical' | 'info' | 'muted';

export interface ResourceSummary {
  tone: ResourceSummaryTone;
  title: string;
  detail: string;
  /** Shows a retry button; set only where retrying is safe without a confirmation. */
  retryable?: boolean;
}

/**
 * Derive the popup's compact Local AI resource summary from cached
 * compatibility storage, settings, and (optional) runtime NER status.
 *
 * Returns null on OK systems with Local AI enabled and no CPU/WASM
 * fallback — those systems should stay quiet in the popup.
 */
export function deriveResourceSummary(
  settings: Settings | null,
  status: SystemCompatibilityStatus | null,
  nerStatus?: NerStatus | null,
): ResourceSummary | null {
  if (!settings || !status) return null;

  if (status.localAiState === 'off-load-failure') {
    return {
      tone: 'critical',
      title: t('res.loadFailed.title'),
      detail: t('res.loadFailed.detail'),
      // A critical-memory system needs the options page's confirmation first.
      retryable: status.tier !== 'critical',
    };
  }

  if (status.localAiState === 'off-low-memory-auto') {
    return {
      tone: 'critical',
      title: t('res.lowMemory.title'),
      detail: t('res.lowMemory.detail', { mem: memoryWording(status) }),
    };
  }

  if (status.localAiState === 'enabled-low-memory-override') {
    return {
      tone: 'critical',
      title: t('res.lowMemOverride.title'),
      detail: t('res.lowMemOverride.detail', { mem: memoryWording(status) }),
    };
  }

  if (settings.nerProvider === 'off' || status.localAiState === 'off-user-choice') {
    return {
      tone: 'info',
      title: t('res.aiOff.title'),
      detail: t('res.aiOff.detail'),
    };
  }

  if (nerStatus?.state === 'ready' && isCpuFallback(nerStatus)) {
    return {
      tone: 'warning',
      title: t('res.cpu.title'),
      detail: t('res.cpu.detail'),
    };
  }

  if (status.tier === 'warning') {
    return {
      tone: 'warning',
      title: t('res.warn.title'),
      detail: t('res.warn.detail', { mem: memoryWording(status) }),
    };
  }

  if (status.tier === 'unknown') {
    return {
      tone: 'warning',
      title: t('res.unknown.title'),
      detail: t('res.unknown.detail'),
    };
  }

  // OK tier with Local AI enabled and no fallback — stay quiet.
  return null;
}

function memoryWording(status: SystemCompatibilityStatus): string {
  return typeof status.browserMemoryGb === 'number'
    ? `${status.browserMemoryGb} GB`
    : t('res.memUnavailable');
}
