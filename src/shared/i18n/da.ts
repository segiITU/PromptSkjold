import { daCommon } from './messages/common.da';
import { daOverlay } from './messages/overlay.da';
import { daPopup } from './messages/popup.da';
import { daOptions } from './messages/options.da';
import { daInpage } from './messages/inpage.da';

/** Danish dictionary (source language). Add a new surface by spreading its messages here and in en.ts. */
export const da = {
  ...daCommon,
  ...daOverlay,
  ...daPopup,
  ...daOptions,
  ...daInpage,
} as const;

export type MessageKey = keyof typeof da;
