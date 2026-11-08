import { enCommon } from './messages/common.en';
import { enOverlay } from './messages/overlay.en';
import { enPopup } from './messages/popup.en';
import { enOptions } from './messages/options.en';
import { enInpage } from './messages/inpage.en';
import type { MessageKey } from './da';

/** English dictionary. The type forces it to have exactly the keys of the Danish one. */
export const en: Record<MessageKey, string> = {
  ...enCommon,
  ...enOverlay,
  ...enPopup,
  ...enOptions,
  ...enInpage,
};
