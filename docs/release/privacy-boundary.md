# Privacy Boundary Verification

Run this check before release validation and before creating the official Chrome package:

```bash
npm run check:privacy-boundary
```

The check is CI-safe and does not require prepared model assets. It verifies that the extension source does not add telemetry, analytics, crash-reporting dependencies, or runtime network primitives that could upload user content.

## What Is Checked

- Runtime source under `src/` is scanned for `fetch`, `XMLHttpRequest`, `sendBeacon`, `WebSocket`, `EventSource`, remote `importScripts`, and remote script tags.
- `package.json` dependencies are scanned for common analytics, telemetry, and crash-reporting packages.
- Transformers.js runtime configuration is checked so remote model loading stays disabled and packaged extension assets remain the model/runtime source.

## Approved Runtime Network Primitive

There are two approved runtime network primitives. The first is the `fetch(url, { method: 'HEAD' })` probe in `src/offscreen/ner-provider.ts`.

That probe is limited to local extension asset existence checks. The NER provider builds the checked URLs with `chrome.runtime.getURL(...)`, and Transformers.js is configured with:

- `allowRemoteModels = false`
- `allowLocalModels = true`
- `localModelPath = chrome.runtime.getURL(...)`
- browser, filesystem, and WASM caches disabled

## OCR Language Data Is Packaged

The extension makes no request to download OCR data. `dan.traineddata` and `eng.traineddata` (Tesseract `tessdata_fast`, Apache-2.0, 6.4 MB in total) are committed under `vendor-data/ocr/`, copied to `ocr/lang/` in the package by the build, and read from there. Earlier versions downloaded them from `raw.githubusercontent.com`; that download, its optional host permission and the stored copy are gone (the old copy is deleted when the extension updates).

- **The one `fetch` in `src/ocr/asset-store.ts`** reads `chrome.runtime.getURL('ocr/lang/<file>')`, a `chrome-extension://` address, so nothing leaves the device. It is the second entry in the static check's allowlist.
- **Integrity:** a unit test checks each shipped file against the SHA-256 pinned in `src/ocr/pack-manifest.ts`, so a changed or truncated file fails the build. The package signature covers the files at release.
- **Where it is kept at runtime:** tesseract.js copies the language data into its IndexedDB cache in the browser profile. It contains no personal data.
- **Not downloaded at runtime:** the tesseract.js worker, the Tesseract core (WASM), the pdf.js worker and fflate are packaged in the extension, so the extension's CSP does not allow remote code.

OCR, PDF reading, Word, Excel, PowerPoint and text handling and the blacked-out copies all run in the offscreen document or content script on the device. Attached files, the text read from them and the replaced copies are never sent anywhere by the extension.

If a future change needs another network primitive, document the user-visible reason, prove that it cannot upload clipboard text, prompts, responses, detected entities, identity vault data, feedback logs, or model input, and extend the static check with a narrow allowlist entry.

## Local Data Boundary

The extension stores settings, placeholder maps, identity vault records, allow/block lists, system compatibility state, and feedback records in Chrome extension local storage or in local runtime memory. The public beta does not include telemetry, analytics, automatic remote feedback collection, automatic crash-report upload, or remote inference.

User content and local feedback logs are not used for training by this project unless a user separately creates and contributes a sanitized sample outside the extension.
