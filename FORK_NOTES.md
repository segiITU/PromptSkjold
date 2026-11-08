# Fork notes

This directory is a modified copy of the **DFKI Privacy Guardrail** browser extension
(<https://github.com/dfki-dsa/pii-guardrail-browser-extension>, Apache-2.0). It is a local-first extension
that stops people from accidentally sharing personal data (PII) with AI chat services. Detection runs in the browser; no
prompt text leaves it for detection.

## Licence and attribution

- Code: Apache-2.0. `LICENSE`, `NOTICE` and `THIRD_PARTY_NOTICES.md` are kept unchanged.
- The `NOTICE` file states that the DFKI name, the DFKI logo, the "Privacy Guardrail" name and the project logos are **not**
  licensed for reuse (except to describe the origin). The name, the icon (`src/assets/icons/`), `README.md`, `PRIVACY.md`,
  `TERMS.md` and `IMPRESSUM.md` still carry DFKI branding and name DFKI as controller. They must be replaced before any
  public release.
- The bundled model (`bardsai-mini`, see below) is fine-tuned from `bardsai/eu-pii-multi-mini-preview`; credit the base model
  and include the Microsoft licence text when publishing it on Hugging Face (see `THIRD_PARTY_NOTICES.md`). Published 2026-11-07 as
  `ermias-ai/da-pii-mini-preview-21m` (https://huggingface.co/ermias-ai/da-pii-mini-preview-21m), with an in-browser demo Space (https://huggingface.co/spaces/ermias-ai/da-pii-mini-preview-21m-demo).
- Nothing in this fork makes a GDPR-compliance claim. The tool is assistive and can miss PII.

## What the fork adds

| Area | Upstream | This fork |
| --- | --- | --- |
| Interception | Paste only | **Submit interception** (`src/content/submit-interceptor.ts`): capture-phase Enter, send-button click and form submit are held until the text has been scanned; review overlay (anonymize / edit / send unchanged); one-shot bypass for the re-submit; fail-closed on scan errors (message not sent, second press within 15 s sends unscanned). Selectors for ChatGPT, Claude, Gemini and a generic adapter are best guesses (unverified on live sites). |
| Danish | none | CPR (calendar check, no mod-11), Danish phones (+45/0045/8 digits, bare form only with context), reg/konto accounts (weak), Danish context keywords. |
| Secrets | none | Provider tokens (AWS, GitHub, OpenAI/Anthropic-style, Stripe, Slack, Google, JWT), private keys, `user:password@` URLs, `password`/`adgangskode`/`kodeord`-style assignments. Reported as PASSWORD. |
| New identifier types | none | Keyword-anchored recognizers in `crate/src/regex_recognizers.rs`: ID_DOCUMENT (passport / driving licence), BIRTH_DATE, birthplace (as LOCATION), JOB_TITLE, workplace (as ORGANIZATION), FINANCIAL_INFO (salary / debt). The fine-tuned model now covers most of these types as well; the rules stay as a second layer. |
| Model | ~1 GB RAM default | `bardsai-mini`: 21.8 MB int8 mMiniLMv2-L6-H384, vocabulary pruned to Danish+English. WASM (CPU) by design (faster than WebGPU for this size). |
| Model noise | none | `src/offscreen/ner-noise-filter.ts`: drops log levels, HTTP verbs, generic role words, bare country names, trailing commas; model guesses for card/IBAN/CPR/SSN must pass the same checksums as patterns; `ACCOUNT_IDENTIFIER` hidden. |
| Long pastes | chunked, unbounded | >= 20,000 chars: patterns scan everything; the model skips chunks without a capitalised word, reads name-dense chunks first and stops after 20 s, with a user-visible coverage notice. The context scan was made O(n log n) (was quadratic). |
| Review overlay | per-item dismiss | "Always allow this value" now releases every occurrence of that value in the text. |
| Status | warned "running on CPU" | The CPU warning is suppressed for models that prefer CPU. |
| Own sites | fixed list in `manifest.json` | **User-added sites** (`src/shared/user-sites.ts`, `src/background/user-sites.ts`): options card and popup button ask Chrome for one origin at a time (`optional_host_permissions` `https://*/*`, plus `scripting` and `activeTab`); the service worker registers the content scripts (generic adapter) and records pending / active / error per site. Removing a site unregisters it and revokes the permission. No automatic discovery of unknown chatbots. |
| Welcome guide | none | **Three-slide guide** opened once after a fresh install (`src/onboarding/`, `src/shared/onboarding-storage.ts`): how it works (looping CSS animation), choosing sites (built-in sites, add your own, suggested sites), and setup switches (image check, what to flag, language of replacements). "Vis guide igen" in the options page reopens it. Content is plain data in `src/onboarding/content.ts`. |
| Copilot | none | Built-in site `copilot.microsoft.com` / `copilot.com` with a `CopilotAdapter` (selectors from known markup plus generic fallbacks; unverified on the live site because Copilot needs a sign-in). One-click suggestions for other sites: `src/shared/suggested-sites.ts`. |
| Tests | upstream suite | Rust 103, jest 1195, Playwright 42 (real Chromium + built extension + mock chat page, asserts what reaches the network). |

## Tiny-model integration

- Model key `bardsai-mini`: int8 build of `bardsai/eu-pii-multi-mini-preview`, fine-tuned for Danish/English with a pruned vocabulary. Published as <https://huggingface.co/ermias-ai/da-pii-mini-preview-21m> (model card with evaluation numbers and limits).
- The weights are not in the repository. `npm run fetch:model` downloads them (SHA-256 checked) and copies the committed tokenizer and config files from `vendor-data/model/` into `generated/models/ner/bardsai-mini-da-en/` (git-ignored).
- First scan ~1.1 s including model load, then roughly 90-400 ms per window (headless Chromium, WASM, one laptop). WebGPU is not used by default.
- Chunking in production: windows of up to 480 tokens with 64 tokens of overlap (`src/offscreen/ner-provider.ts`).

## Build (Windows, no MSVC)

Native `cargo build` needs the MSVC linker. Without it, build the crate in WSL and package on Windows:

```bash
# WSL: rustup with the wasm32-unknown-unknown target
cargo build --release --target wasm32-unknown-unknown   # inside crate/
```

```powershell
# Windows, from crate/ (wasm-bindgen 0.2.118 prebuilt binary)
wasm-bindgen --target web --out-dir pkg --out-name privacy_guardrail_wasm target/wasm32-unknown-unknown/release/privacy_guardrail_wasm.wasm
cd ..; npm install; npm run build:ext
```

Load `dist/` via `chrome://extensions` (Developer mode, Load unpacked) or `edge://extensions`. Firefox is not supported
(the build relies on Chrome's offscreen-document API).

## Test

CI (`.github/workflows/ci.yml`) runs `npm run validate:ci` (WASM build, jest, svelte-check, permission audit, privacy
boundary, cargo test, model-free build) and the Playwright harness against mock chat pages on every push and pull request.
The bundled model is not in the repository, so CI covers pattern-only detection; model-backed checks stay local.

```powershell
npm test                                   # jest (unit)
npx playwright install chromium            # once
npx playwright test --config e2e/live/playwright.harness.config.ts submit-interception ner-smoke
```

## Known limitations

- Submit interception is verified only against a **mock** chat page; live selectors are unverified.
- Enter is always treated as "send" (Ctrl+Enter-to-send users have Enter held).
- Edit-message boxes, voice input, **file/image uploads** and other submit paths are not intercepted.
- Firefox is not supported.
- Danish reg/konto numbers with words between the parts, standalone postcode+city and job titles outside the built-in role
  list are missed; public figures and placeholder emails (`test@test.com`) are flagged.
- Latency numbers are native Node, not the browser.

See `TODO.md` for the open work.
