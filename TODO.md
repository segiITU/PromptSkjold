# Open items

Public roadmap notes for PromptSkjold, roughly ordered by value. Nothing here is a commitment. Finished work is in
[`CHANGELOG.md`](CHANGELOG.md).

## Verification still owed
- [ ] **Live-site checks.** Submit and paste interception, file attach, the review overlay, the status chip and the scanning
      indicator are covered by unit tests and a mock-page Playwright harness, but need regular manual checks on the real
      sites (ChatGPT, Claude, Gemini, Copilot; Copilot needs a sign-in and its selectors are unverified). Use dummy text only.
- [ ] **Real Office files.** The fixtures in `tests/fixtures/office/` are hand-built. Open rebuilt copies in real Word, Excel
      and PowerPoint. `skjult-powerpoint.pptx` is too minimal for LibreOffice and may need repair in Office.
- [ ] **Gemini "Replace & paste"** once left entities unreplaced (seen once, not reproduced). Try to reproduce and add a check
      that what is inserted matches the replaced text.
- [ ] **Browser latency on huge pastes** (measured so far in Node and headless Chromium, not on a real long paste).

## Detection
- [ ] Danish phone, CPR and date edge cases: bare 8-digit phone only with a keyword on the same line; dot-separated CPR
      (`120166.5152`) and bare 10-digit CPR without context are missed (no modulus-11 check, by decision); written dates
      (`14. maj 1982`) are not flagged while `99/99/9999` is; no IPv6; Amex/14-digit cards and lowercase IBAN are not matched;
      UK account numbers are not redacted.
- [ ] Model limits listed in the model card and `docs/user/detected-categories-and-limitations.md`: speech-to-text and typo
      robustness, lowercase multi-part names, long compound job titles, salary and debt in tables, names used as brands.
- [ ] Standalone postcode + city, passport/licence numbers without a label word, job titles outside the built-in list.
- [ ] Faces, fingerprints and genetic data in images and files.
- [ ] OCR-style examples for training if the model is trained again (Tesseract misreads such as `Anszttelsesnr`), and
      "kommune" examples.
- [ ] A larger or better model for the browser and for self-hosting; measure recall, latency and size against the current
      22 MB model before deciding.
- [ ] Do not re-detect text the extension already replaced: placeholders are handled, made-up synthetic names can still be
      detected again.

## Files
- [ ] Not read yet: `.odt/.ods/.odp`, old `.doc/.xls/.ppt`, `.rtf`, `.heic`, `.tiff`; Excel sheet names, chart caches,
      PowerPoint masters and layouts, custom XML; PDF form fields are read but not blacked out.
- [ ] Move the Office unzip and XML parsing into the offscreen document (smaller attack surface).
- [ ] Decide the default for the Excel/PowerPoint check (off today, with a "Slå til" notice).
- [ ] Optional second OCR tier for hard scans; a benchmark with Danish scans and photos.
- [ ] Remove the unused parts of `ImageCheckDialog` (item list, preview, redact); it is only used for problems.

## Product
- [ ] **Daily health check:** a scheduled run that loads the built extension in real Chromium and checks every protected
      site (composer found, paste/submit/attach intercepted, review overlay shown, nothing unchecked on the network).
- [ ] More chat sites with per-site adapters and Playwright mock pages (Perplexity, DeepSeek, Le Chat, Grok, Poe, chat.dk, ...).
      User-added sites are not part of any health check yet; `http://` sites are not supported.
- [ ] Optional auto-send after "Replace & paste" (off by default).
- [ ] Firefox: needs a background event page instead of Chrome's offscreen document.
- [ ] Package size (about 28 MB zipped; the model is 73% of it): smaller vocabulary or int4 embeddings, a custom minimal ONNX
      Runtime build. Only with a recall check on blind test sets.
- [ ] Optional milestone thank-you box (local counter only, no telemetry).
- [ ] Decide whether the onboarding guide should share the language setting of the options page.

## Design
- [ ] Final wordmark and lockups (`design/logo/`, `src/assets/lockup.png`); decide whether the popup header uses the lockup.
- [ ] Entity icons: the current set still reads as generic and phone/cpr/key/tag are weak at 12 px.
- [ ] Check contrast of the 12 px grey disclaimer and the small `[IBAN_1]` tags on a real display.
- [ ] Fonts: IBM Plex Sans/Serif and JetBrains Mono (OFL, bundled); see `docs/design/BRAND.md` for alternatives considered.

## Project and legal
- [ ] Enable GitHub private vulnerability reporting on the public repository, then mention it in `SECURITY.md`.
- [ ] Have `TERMS.md` reviewed (it is marked as an unreviewed draft).
- [ ] Contact DFKI about this fork; the DFKI name and logo are not licensed for use with it (see `NOTICE`).
- [ ] Rebrand leftovers: the Rust crate name `privacy-guardrail-wasm` and wasm file names (build plumbing), and
      "Privacy Guardrail" in some source-file header comments. `docs/legal/DFKI-TERMS-upstream.md` is kept as the upstream record.
- [ ] Refresh `docs/user/` (written for the upstream project; parts, such as the WebGPU notes, are out of date).
- [ ] Independent code review, with a human look at the privacy boundary, the manifest and the build scripts.
- [ ] Rust vs Python timing comparison of the pattern layer (optional).

## Notes for contributors
- **Placeholder filters are deliberate:** `isPlaceholderPhone` (e.g. `12345678`) and `PLACEHOLDER_EMAIL_DOMAIN`
  (`example.com/org/net/dk`) in `src/offscreen/span-post-filter.ts` drop obvious test data. Synthetic test data must look
  real (`+45 50930610`, `@syntetisk-firma.test`).
- **Build hygiene:** `crate/pkg` and `dist/wasm` are git-ignored build products. Rebuild the WASM after any pull or
  checkout. If `npm run build:ext` exits with no output, run its three steps separately (`node scripts/build-tokens.js`,
  `node scripts/build-page-assets.js`, `npx webpack --mode production`).
- **Windows without MSVC:** build the crate in WSL, then run `wasm-bindgen` on the result; see `FORK_NOTES.md`.
