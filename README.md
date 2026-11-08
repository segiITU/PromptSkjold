<img align="left" alt="PromptSkjold" src="src/assets/lockup.png" height="96">
<br clear="all">

# PromptSkjold

PromptSkjold is a Manifest V3 Chrome extension that detects personally identifiable information (PII) before text is pasted into supported LLM chat apps. Detection runs **entirely on your device**: deterministic recognizers compiled from Rust to WebAssembly, plus optional transformer NER through ONNX Runtime Web. No pasted text leaves the browser, and the project has no telemetry.

PromptSkjold is an independent fork of the open-source *Privacy Guardrail* extension by the [German Research Center for Artificial Intelligence (DFKI)](https://www.dfki.de/), used under the Apache License 2.0. DFKI does not operate, review or endorse PromptSkjold. Maintained by Sebastian Gilson ([ermias.ai](https://ermias.ai), kontakt@ermias.ai); source and issues at <https://github.com/segiITU/PromptSkjold>.

> **Status — public beta (`0.x`).** Detection is assistive: it helps you catch personal data before it leaves your machine, but it will not catch everything and is not a compliance or DLP product. See [Known limitations](#known-limitations).

## Contents

- [Supported chat apps](#supported-chat-apps)
- [Files and images (optional)](#files-and-images-optional)
- [Install](#install)
- [System requirements](#system-requirements)
- [How it works](#how-it-works)
- [Known limitations](#known-limitations)
- [Documentation](#documentation)
- [For developers](#for-developers)
- [Roadmap](#roadmap)
- [Acknowledgements](#acknowledgements)

## Supported chat apps

- ChatGPT (`chat.openai.com`, `chatgpt.com`)
- Claude (`claude.ai`)
- Gemini (`gemini.google.com`)
- Microsoft Copilot (`copilot.microsoft.com`, `copilot.com`), not yet checked on the live site

You can add other chat sites yourself under "Dine egne sider" in the options page (the browser asks for permission for each site; only the built-in sites are tested by the project).

## Files and images

PromptSkjold also reviews files you attach to a supported chat. This is **on by default** and can be switched off with "Tjek billeder og scannede PDF'er" in the popup (Protect tab) or on the options page. The Danish and English text-recognition data (6.4 MB) ships inside the extension, so nothing is downloaded (see [`docs/release/privacy-boundary.md`](docs/release/privacy-boundary.md)).

| File type | What is read | What you can attach |
| --- | --- | --- |
| Images (png, jpeg, webp, bmp, gif) | Text found by local OCR | The original, or a copy with the found items blacked out |
| PDF | Text layer (up to 500 pages); scanned pages by OCR (up to 20) | A text file with replacements, or a blacked-out PDF (up to 20 pages) |
| Word (.docx) | Body text | A .docx with the items replaced |
| Excel (.xlsx) | Text and numbers in every sheet, row by row | An .xlsx with the items replaced (changed cells become plain text; emptied of the original value) |
| PowerPoint (.pptx) | Slide text, speaker notes and SmartArt text | A .pptx with the items replaced |
| Plain text (txt, csv, tsv, md, log, json, xml, html, yaml, ini, eml, vcf, ics) | The text | The same file type with the items replaced |

When you attach several files, the first is checked at once and the rest are checked in the background while you review it. Replacements for Danish text use invented Danish names, towns and organisations, and generic numbers (for example `123456-7890` for a CPR number).

Not read: old `.doc`, `.xls` and `.ppt`, `.rtf`, `.heic`, `.tiff`, Word headers, footers and comments, Excel comments and charts, PowerPoint comments and charts, and the author and title stored inside Office files. OCR is weak on photos, handwriting and rotated pages. A file type the extension does not read goes through unchecked. See [Detected categories and limitations](docs/user/detected-categories-and-limitations.md).

## Install

End users should install from the **Chrome Web Store** once the listing is live. Each GitHub Release also attaches the packaged ZIP and SHA-256 checksum for transparency and manual loading.

For an unpacked developer install, see [`docs/developer/building.md`](docs/developer/building.md).

## System requirements

- Chrome desktop stable (latest).
- The active Local AI model is a roughly 22 MB int8 Danish/English model that runs locally on CPU/WASM; it does not require WebGPU.
- **Minimum for Local AI:** more than 2 GB browser-reported memory. On 2 GB or less, the extension auto-disables Local AI and runs pattern-only detection. Between 2 GB and 4 GB, Local AI stays on but a slowdown warning may appear.
- On capable systems (more than 4 GB browser-reported memory, passive WebGPU available, and no known CPU/WASM fallback), Local AI may warm automatically while the user is active on a supported chat page.
- Larger experimental model configurations can use WebGPU, but are not the default packaged model.
- Pattern-only detection runs on any supported Chrome system regardless of memory or WebGPU.

These requirements are heuristic because Local AI runs a transformer NER model entirely in the browser and Chrome reports memory in coarse buckets.

## How it works

- Intercepts text paste and submission events in supported chat inputs, and supported attachment uploads.
- Detects regex/checksum-backed PII such as email addresses, phone numbers, SSNs, credit cards, IBANs, IP addresses, and dates.
- Adds local transformer NER for names, addresses, identifiers, credentials, and other free-text PII when model assets are prepared.
- Shows a review UI before replacing detected spans.
- Replaces selected spans with stable placeholders such as `[EMAIL_1]` or `[PERSON_1]`.
- Stores the placeholder map locally in Chrome storage so model responses can be restored later, with restored values visually highlighted.

No pasted text is sent to a remote inference service. There is no telemetry or analytics. See [`PRIVACY.md`](PRIVACY.md) for the full privacy posture.

## Known limitations

- Detection can miss sensitive content and can flag harmless text.
- Short names, ambiguous words, code blocks, tables, and unusual formatting reduce detection quality.
- Local AI can be slow or unavailable depending on browser, device memory, and WebGPU support; pattern-only mode covers a narrower set of categories.
- Restoration of placeholders into model responses depends on local records and may not handle every response rewrite.
- Attached files are only checked when the optional file check is on, and only for the file types listed above. Other file types, and anything attached by a route the extension does not see, are not checked.
- OCR can miss or misread text, so a blacked-out image or PDF can still show something it should not. Check the result before you send it.

## Documentation

### For End-Users

- [User guide](docs/user/) — install, day-to-day use, Local AI explained, managing local data, troubleshooting, reporting issues safely, detected categories and limitations.
- [Privacy posture](PRIVACY.md)
- [Terms of Use](TERMS.md)
- [Security reporting](SECURITY.md)
- [Support](SUPPORT.md)
- [Changelog](CHANGELOG.md)
- [Impressum / Legal notice](IMPRESSUM.md)

### Project

- [Contributing](CONTRIBUTING.md)
- [Building from source](docs/developer/building.md)
- [Model assets](docs/developer/model-assets.md)
- [Releasing](docs/developer/releasing.md)

### For Developers

Quickstart for working on the extension:

```bash
rustup update
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.118 --locked
npm ci

npm run fetch:model     # downloads the 21.8 MB Danish/English model from Hugging Face (checksum-verified)
npm run build:wasm      # Rust -> WebAssembly (crate/pkg)
npm run build:ext       # bundles the extension into dist/
```

Load `dist/` as an unpacked extension in `chrome://extensions` (Developer mode). `npm run dev` rebuilds on change.

**What is and is not in the repository.** The Rust source, the tokenizer and config files (`vendor-data/model/`) and the Danish/English OCR data (`vendor-data/ocr/`, 6.4 MB) are committed. Two build inputs are not, because they are binary build products:

- the model weights (`onnx/model_quantized.onnx`, 21.8 MB, md5 `c4d3c42f…`), published at [huggingface.co/ermias-ai/da-pii-mini-preview-21m](https://huggingface.co/ermias-ai/da-pii-mini-preview-21m) and fetched by `npm run fetch:model` into `generated/models/ner/bardsai-mini-da-en/`;
- the compiled WebAssembly (`crate/pkg/`), built from `crate/` by `npm run build:wasm`.

Without them the extension still builds, but runs pattern-only detection (no local AI model).

Model-free pull-request checks (unit tests, Rust tests, type checks, permission and privacy-boundary audits):

```bash
npm run validate:ci
```

To use a different model, see [`docs/developer/model-assets.md`](docs/developer/model-assets.md).

### Repository layout

- `src/` — extension TypeScript, Svelte UI, content scripts, offscreen detection, OCR, file readers, benchmark harness code.
- `crate/` — Rust/WASM detection engine (patterns, checksums, name and address context).
- `scripts/` — build, packaging checks, model download and preparation.
- `tests/`, `e2e/` — Jest unit tests and Playwright browser-harness tests.
- `vendor-data/` — OCR language data and model tokenizer/config files.
- `docs/` — user, developer, design and release documentation.

Build output and large artifacts are not committed: `dist/`, `crate/pkg/`, `crate/target/`, `generated/`, `node_modules/`.

## Roadmap

Directional themes — none are commitments, and order may change with evidence and community feedback:

- More reliable local PII detection (smaller models, distillation, fine-tuning, hybrid pipelines).
- More browser-efficient inference paths for lower-resource devices.
- Support for additional Chromium-based browsers beyond Chrome desktop stable.
- Mobile support for AI workflows on smartphones.
- Support for additional AI chat platforms.

## Acknowledgements

PromptSkjold builds on *Privacy Guardrail*, developed in the Data Science and its Applications research department at the [German Research Center for Artificial Intelligence (DFKI)](https://www.dfki.de/) and released under the Apache License 2.0 (see [NOTICE](NOTICE) and [FORK_NOTES.md](FORK_NOTES.md)). The DFKI name and logo are not licensed for use with this fork.

### Upstream contributors (Privacy Guardrail)

- Andrea Sipka
- Björn Busch-Geertsema — Lead Developer
- Sergey Redyuk — Developer
- Siddharth Saraswat – Developer

- Ruth Ikegah – Community Manager
- Prof. Dr. Sebastian Vollmer — Principal Investigator & Project Originator
- Rahul Sharma
- Islam Mesabah
- Kai Spriestersbach
- Andrea Sipka
