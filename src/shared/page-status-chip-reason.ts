import { isCpuFallback } from './constants';
import { t } from './i18n/core';
import type { NerStatus, SystemCompatibilityStatus } from './message-types';

export type ChipReason =
  | 'composer-not-found'
  | 'low-memory-protection'
  | 'enabled-despite-low-memory'
  | 'pattern-only'
  | 'model-failed'
  | 'low-memory-warning'
  | 'unknown-memory'
  | 'running-on-cpu';

export interface ChipReasonInputs {
  status: SystemCompatibilityStatus | null | undefined;
  nerStatus?: NerStatus | null;
  /**
   * True once this page could not find a message box at all — neither the one
   * the site adapter knows nor the target of the paste itself. Text either
   * went through unreviewed, or was reviewed and had nowhere to land. Cleared
   * again as soon as a lookup succeeds.
   *
   * Not raised for a page the extension is matching generically: protection
   * held there, and the popup says so quietly. Reserving this for a real
   * failure is what keeps it meaning one.
   */
  composerMissing?: boolean;
}

/**
 * Derive the single chip reason to display, or null when no degraded
 * protection state applies. The one-time critical modal owns the
 * `low-memory-protection` surface while it is still pending; suppressing
 * the chip in that window prevents duplicate contradictory messaging.
 */
export function deriveChipReason({
  status,
  nerStatus,
  composerMissing,
}: ChipReasonInputs): ChipReason | null {
  // Outranks every reason below, and is reported even when no system status
  // has arrived. Those describe detection running in a reduced mode; this one
  // means the extension is not attached to the page at all, so nothing was
  // reviewed. A chip about memory tiers would be beside the point.
  if (composerMissing) return 'composer-not-found';

  if (!status) return null;

  if (status.localAiState === 'off-load-failure') return 'model-failed';

  if (status.localAiState === 'off-low-memory-auto' && status.tier === 'critical') {
    return status.criticalModal === 'pending' ? null : 'low-memory-protection';
  }

  if (status.localAiState === 'enabled-low-memory-override') return 'enabled-despite-low-memory';

  if (status.localAiState === 'off-user-choice') return 'pattern-only';

  if (status.localAiState === 'enabled' && status.tier === 'warning') return 'low-memory-warning';

  if (status.localAiState === 'enabled' && status.tier === 'unknown') return 'unknown-memory';

  if (
    nerStatus
    && isCpuFallback(nerStatus)
    && nerStatus.state === 'ready'
    && status.localAiState === 'enabled'
  ) {
    return 'running-on-cpu';
  }

  return null;
}

export interface ChipMessage {
  title: string;
  detail: string;
  /** The raw engine error, if any. Kept out of the translated text; shown only as a tooltip. */
  technical?: string;
}

export function chipReasonMessageForStatus(
  reason: ChipReason,
  status?: SystemCompatibilityStatus | null,
): ChipMessage {
  const message = chipReasonMessage(reason);
  const loadFailureMessage = status?.loadFailure?.message?.trim();
  if (reason !== 'model-failed' || !loadFailureMessage) return message;

  return {
    ...message,
    technical: loadFailureMessage,
  };
}

export function chipReasonMessage(reason: ChipReason): ChipMessage {
  switch (reason) {
    case 'composer-not-found':
      return { title: t('chip.composerTitle'), detail: t('chip.composerDetail') };
    case 'pattern-only':
      return { title: t('chip.patternTitle'), detail: t('chip.patternDetail') };
    case 'low-memory-protection':
      return { title: t('chip.lowMemTitle'), detail: t('chip.lowMemDetail') };
    case 'enabled-despite-low-memory':
      return { title: t('chip.lowMemOverrideTitle'), detail: t('chip.lowMemOverrideDetail') };
    case 'model-failed':
      return { title: t('chip.failedTitle'), detail: t('chip.failedDetail') };
    case 'low-memory-warning':
      return { title: t('chip.warnTitle'), detail: t('chip.warnDetail') };
    case 'unknown-memory':
      return { title: t('chip.unknownTitle'), detail: t('chip.unknownDetail') };
    case 'running-on-cpu':
      return { title: t('chip.cpuTitle'), detail: t('chip.cpuDetail') };
  }
}
