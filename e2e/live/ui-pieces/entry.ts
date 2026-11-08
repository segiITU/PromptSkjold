/**
 * Visual-test entry: exposes the in-page UI pieces on `window.PK` so
 * e2e/live/ui-pieces.spec.ts can render each one on a plain page and take
 * screenshots. Built by e2e/live/ui-pieces/webpack.config.js; never shipped.
 */
import { attachDeAnonBanner } from '../../../src/ui/banner/de-anon-banner';
import { CancelDecisionDialog } from '../../../src/ui/cancel-decision-dialog/cancel-decision-dialog';
import { ClipboardToast } from '../../../src/ui/clipboard-toast/clipboard-toast';
import { CriticalLocalAiModal } from '../../../src/ui/critical-local-ai-modal/critical-local-ai-modal';
import { ImageCheckDialog } from '../../../src/ui/image-check-dialog/image-check-dialog';
import { PageStatusChip } from '../../../src/ui/page-status-chip/page-status-chip';
import { ScanningIndicator } from '../../../src/ui/scanning-indicator/scanning-indicator';
import { showOfficeNotice } from '../../../src/ui/office-notice/office-notice';
import { __resetLanguageForTests } from '../../../src/shared/i18n/core';
import { chipReasonMessage } from '../../../src/shared/page-status-chip-reason';

(window as unknown as { PK: unknown }).PK = {
  attachDeAnonBanner,
  CancelDecisionDialog,
  ClipboardToast,
  CriticalLocalAiModal,
  ImageCheckDialog,
  PageStatusChip,
  ScanningIndicator,
  showOfficeNotice,
  chipReasonMessage,
  setLanguage: (lang: 'da' | 'en') => __resetLanguageForTests(lang),
};
