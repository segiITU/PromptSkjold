import type { OcrPackManifest } from './types';
import { TESSERACT_ENGINE_ID } from './engine-ids';

/** Where the packaged language files are served from inside the extension. */
export const OCR_PACK_PATH = 'ocr/lang';

/**
 * Tesseract 5 `tessdata_fast` language data, pinned to
 * tesseract-ocr/tessdata_fast commit 87416418657359cb625c412a48b6e1d6d41c29bd.
 * Licence: Apache-2.0. The files ship inside the extension (`vendor-data/ocr/`,
 * copied to `ocr/lang/` by the build); a unit test checks them against these
 * checksums, so a changed or truncated file fails the build.
 */
export const TESSERACT_PACK: OcrPackManifest = {
  engineId: TESSERACT_ENGINE_ID,
  label: 'Basic text reading (Danish + English)',
  version: '1',
  licence: 'Apache-2.0',
  files: [
    {
      name: 'dan.traineddata',
      sha256: 'acb1fd074487a31d1294fcdfd7d7c673467ffd8aeacb2ccd61ebcbf04eb4e2fa',
      bytes: 2580059,
    },
    {
      name: 'eng.traineddata',
      sha256: '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2',
      bytes: 4113088,
    },
  ],
};
