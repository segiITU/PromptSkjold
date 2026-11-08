# Fork notes

PromptSkjold is an independent, modified fork of the **Privacy Guardrail** browser extension from the Data Science and its
Applications (DSA) department at DFKI, the German Research Center for Artificial Intelligence
(<https://github.com/dfki-dsa/pii-guardrail-browser-extension>, Apache-2.0). Both are local-first extensions that help people
avoid sharing personal data (PII) with AI chat services by checking text in the browser. This file lists what comes from
upstream and what this fork changed. DFKI does not operate, review or endorse PromptSkjold.

## Licence and attribution

- Code: Apache-2.0. `LICENSE` and `NOTICE` are kept as in upstream; `THIRD_PARTY_NOTICES.md` is extended for the added
  components (fonts, Tesseract OCR data, the fine-tuned model).
- The `NOTICE` file states that the DFKI name, the DFKI logo, the "Privacy Guardrail" name and the project logos are **not**
  licensed for reuse (except to describe the origin). This fork therefore uses its own name (PromptSkjold), icons, wordmark
  and fonts, contains no DFKI logos, and names DFKI only as the origin of the code. The controller of PromptSkjold is Sebastian
  Gilson (ermias.ai), see `PRIVACY.md` and `IMPRESSUM.md`. DFKI's original terms are kept for reference in
  `docs/legal/DFKI-TERMS-upstream.md`.
- The bundled model is fine-tuned from `bardsai/eu-pii-multi-mini-preview` (BardsAI); the base model is credited and the
  Microsoft licence text is included (see `THIRD_PARTY_NOTICES.md`). It is published as
  [`ermias-ai/da-pii-mini-preview-21m`](https://huggingface.co/ermias-ai/da-pii-mini-preview-21m), with an in-browser demo at
  <https://huggingface.co/spaces/ermias-ai/da-pii-mini-preview-21m-demo>.
- Nothing in this fork makes a GDPR-compliance claim. The tool is assistive and can miss PII.

## What the fork adds

| Area | Upstream | This fork |
| --- | --- | --- |
| Interception | Paste | **Paste and submit** (`src/content/submit-interceptor.ts`): Enter, send-button click and form submit are held until the text has been scanned; review overlay (anonymize / edit / send unchanged); one-shot bypass for the re-submit; fail-closed on scan errors (the message is held). Selectors for the built-in sites and a generic adapter are checked against mock pages; live-site checks are still being done by hand. |
| Files and images | none | **Attachments are checked before upload** (`src/content/attachment-interceptor.ts`, `src/files/`, `src/ocr/`): images and scanned PDFs through bundled Tesseract OCR (Danish and English data in the package), PDF, Word and text files, and Excel and PowerPoint (switch, off by default). Types are recognised by their first bytes, not by name. The user reviews the findings and the extension attaches a copy with the items blacked out or replaced. File names are checked too. File types that cannot be read pass unchecked with a notice. |
| Danish | none | CPR (calendar check, no mod-11), Danish phones (+45/0045/8 digits, bare form only with context), reg./konto accounts, Danish context keywords, Danish synthetic replacements (invented Danish names, towns and organisations). |
| Secrets | none | Provider tokens (AWS, GitHub, OpenAI/Anthropic-style, Stripe, Slack, Google, JWT), private keys, `user:password@` URLs, `password`/`adgangskode`/`kodeord`-style assignments. Reported as PASSWORD. |
| New identifier types | none | Keyword-anchored recognizers in `crate/src/regex_recognizers.rs`: ID_DOCUMENT (passport / driving licence), BIRTH_DATE, birthplace (as LOCATION), JOB_TITLE, workplace (as ORGANIZATION), FINANCIAL_INFO (salary / debt, also GBP/NOK/SEK/CHF). The model covers most of these types too; the rules stay as a second layer. |
| Model | about 1 GB RAM default | `bardsai-mini`: 21.8 MB int8 mMiniLMv2-L6-H384, vocabulary pruned to Danish and English, fine-tuned on synthetic data. Runs on the CPU through WASM by design (faster than WebGPU at this size). |
| Model noise | none | `src/offscreen/ner-noise-filter.ts` drops log levels, HTTP verbs, generic role words and bare country names; model guesses for card, IBAN, CPR and SSN must pass the same checksums as the patterns; name particles (`van der`, `í`) join into whole names. |
| Long pastes | chunked, unbounded | From 20,000 characters the patterns scan everything and the model reads name-dense chunks first and stops after 20 s, with a visible coverage notice. The context scan is O(n log n) (was quadratic). |
| Review overlay | per-item dismiss | "Always allow this value" releases every occurrence of that value in the text. |
| Own sites | fixed list in `manifest.json` | **User-added sites** (`src/shared/user-sites.ts`, `src/background/user-sites.ts`): the options card and popup button ask the browser for one origin at a time (`optional_host_permissions` `https://*/*`, plus `scripting` and `activeTab`); the service worker registers the content scripts (generic adapter). Removing a site unregisters it and returns the permission. No automatic discovery of unknown chatbots. |
| Welcome guide | none | Three-slide guide opened once after a fresh install (`src/onboarding/`), Danish with an English switch. |
| Copilot | none | Built-in site `copilot.microsoft.com` / `copilot.com` with a `CopilotAdapter` (unverified on the live site because it needs a sign-in). One-click suggestions for other sites in `src/shared/suggested-sites.ts`. |
| UI and brand | DFKI branding | PromptSkjold name, icons, wordmark and bundled fonts, Danish-first interface with an English switch, category icons in the review. Design tokens in `src/shared/design/`, notes in `docs/design/BRAND.md`. |
| Privacy defaults | n/a | Debug logging and "remember across conversations" are off by default. The local correction log stores no text and is deleted after 30 days. The vault and the log are stored unencrypted in the browser profile (stated in `PRIVACY.md`). |
| Hardening | n/a | Review-before-send cannot be bypassed by stale pastes or cancel; Office files with DTDs or entities are refused and unpacked sizes are limited; changed Office copies drop document properties, comments and tracked-deletion text; `eval` removed from the shipped bundle; release packaging refuses key and certificate files. |
| Tests | upstream suite | Rust 143, Jest 1464 (123 suites), Playwright 50 (real Chromium with the built extension and mock chat pages, asserting what reaches the network). |

## Model

- Model key `bardsai-mini`: int8 build of `bardsai/eu-pii-multi-mini-preview`, fine-tuned for Danish and English with a pruned
  vocabulary. The model card has evaluation numbers and limits:
  <https://huggingface.co/ermias-ai/da-pii-mini-preview-21m>.
- The weights are not in this repository. `npm run fetch:model` downloads them (SHA-256 checked) and copies the committed
  tokenizer and config files from `vendor-data/model/` into `generated/models/ner/bardsai-mini-da-en/` (git-ignored). Without
  the weights the extension builds in pattern-only mode.
- First scan about 1.1 s including model load, then roughly 90-400 ms per window (headless Chromium, WASM, one laptop).
  WebGPU is not used by default.
- Chunking: windows of up to 480 tokens with 64 tokens of overlap (`src/offscreen/ner-provider.ts`).

## Build

```bash
npm ci
npm run fetch:model   # model weights (optional; without them: pattern-only mode)
npm run build:wasm    # needs Rust, the wasm32-unknown-unknown target and wasm-bindgen 0.2.118
npm run build:ext     # tokens, page assets, webpack
```

Native `cargo build` on Windows needs the MSVC linker; without it, build the crate in WSL and copy `crate/pkg` over. Load
`dist/` through `chrome://extensions` or `edge://extensions` (Developer mode, Load unpacked). Chrome and Edge are supported.
Firefox is not (the build relies on the offscreen-document API).

## Test

CI (`.github/workflows/ci.yml`) runs `npm run validate:ci` (WASM build, Jest, svelte-check, permission audit, privacy boundary,
cargo test, model-free build) and the Playwright harness against mock chat pages on every push and pull request. The model is
not in the repository, so CI covers pattern-only detection; model-backed checks stay local.

```bash
npm test                          # Jest (unit)
npx playwright install chromium   # once
npx playwright test --config e2e/live/playwright.harness.config.ts submit-interception ner-smoke
```

## Known limitations

- Submit interception, file attach and Copilot are verified against **mock** pages and by hand on some sites; live selectors
  can break when a chat site changes its markup.
- Enter is always treated as "send" (Ctrl+Enter-to-send users have Enter held).
- Edit-message boxes and voice input are not intercepted. File types the extension cannot read pass unchecked with a notice.
- Text in scanned images depends on OCR quality; rotated or tilted pictures can be read poorly.
- The model is weakest on speech-to-text output, text with many typos, lowercase multi-part names, long job titles and names
  that are also brands. Names in other scripts (for example Arabic) are not covered by the vocabulary.
- Public figures and placeholder emails can be flagged; the user dismisses them in the review.
- Firefox is not supported.

See `TODO.md` for the open work.
