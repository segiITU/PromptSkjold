# Threat Model

PromptSkjold is a public beta Chrome extension for local, assistive PII review before text is pasted into supported LLM chat apps. This document describes the intended security and privacy boundary for the public source at `git@github.com:segiITU/PromptSkjold.git`.

## Assets

The extension handles:

- Clipboard text being pasted into supported chat inputs.
- Detected entity spans and category labels.
- Placeholder maps used to replace sensitive text with stable placeholders.
- Identity vault records used for consistent local placeholder restoration.
- Local settings, allow/block lists, Local AI state, and feedback/correction records when enabled.
- Packaged WASM, ONNX Runtime Web, and local model assets.

These assets should remain local to the browser profile unless the user deliberately exports or shares sanitized information outside the extension.

## Trust Boundaries

### Extension Pages

The popup, options page, background service worker, and offscreen document run as extension pages. They can use extension storage and message passing. Extension pages must not add telemetry, analytics, automatic crash uploads, remote feedback upload, or remote model inference without a new privacy and security review.

### Content Scripts

Content scripts run on the supported beta sites:

- `chatgpt.com`
- `chat.openai.com`
- `claude.ai`
- `gemini.google.com`

They should limit interaction to supported chat UI behavior needed for paste interception, review display, placeholder insertion, page status, and restoration where supported.

### Attachment Interception

When the optional file review is on, the content script listens, in the capture phase, for `change` on file inputs and for `drop` and `paste` events carrying files. It reads the files, shows a review and then hands the chosen file back to the page by setting the page's own file input and firing `input` and `change` events (with a synthetic drop or paste as a fallback).

- **Only real user actions are handled.** The interceptor acts only on events with `isTrusted` true, so a page script cannot make the extension read a file by dispatching a made-up event. Made-up events are passed through untouched, which means a page could in principle add a file to its own input without a check; that is not a way to read data from the user's device.
- **The page cannot read files through the extension.** Results stay in the content script and extension pages. The hand-back gives the page only the file the user chose to attach.
- **A held drop** is never seen by the page. The extension sends a `dragleave` on the drop target so the page can close its drop-zone layer.
- **Unreadable or unsupported files** are passed on, with a dialog where the file type is one that is read. This is a coverage gap, not a leak, and is listed under residual risks. What a file is comes from its first bytes (PNG, JPEG, GIF, WebP, BMP, PDF, and Word, Excel or PowerPoint inside a zip), not only from its name and type; a file whose type is empty or generic is held for that look. A file with a specific type the extension does not read (for example `application/msword`) is trusted as that type and passed on with the notice.
- **File names** are scanned like the text (the part before the extension) and reviewed with the file; the copy that is attached carries the replaced name, or a neutral `dokument-n` for blacked-out pictures and PDFs. Files of a type that is not read keep their name.
- **Office files are unpacked and parsed on the chat page's thread.** Archives may unpack to 40 MB in total (20 MB per part), and any XML part with a document type declaration or entity is refused before parsing. A crafted file inside those limits can still keep the tab busy for a while; moving the work to the offscreen document is open (see the red-team report, F4).
- **Image bombs.** The pixel size is read from the image header and anything above 40 megapixels is refused before the browser decodes it, so a small file that declares a huge picture cannot exhaust the offscreen document that also hosts the detection model.
- **Parts of Office files the text pass does not read.** A changed Word, Excel or PowerPoint copy is the original package with the text replaced, so anything outside the read text would travel with it. The copy therefore drops document properties (`docProps/*`: author, last modified by, company) and comment parts (with the anchors and drawings that point at them), empties tracked deletions in Word and blanks the author names on tracked changes. Word headers, footers, footnotes and endnotes are read and replaced like the body. The text of those parts (author, company, comments, deleted text) is appended to the text that is checked, so a finding there sends the file to review even when the body is clean. Still carried over unread and unreplaced: charts, embedded images and files, custom XML, sheet names, slide masters; the review lists them. If nothing is found the original file is attached as it is.
- **Large or hostile files** are bounded by size caps and by page and time limits (OCR and PDF work has timeouts), so a crafted file should end in an error dialog, not in a hang of the chat page. PDF and OCR work runs in the offscreen document, not in the page.

### OCR Data Download

The language data is the only thing the extension downloads at runtime. It is fetched only after the user opts in, from one fixed host and path, and is rejected unless it matches a pinned SHA-256. The host permission is optional and requested at that moment. A compromise of the GitHub repository would still need to defeat the pinned hash, which is shipped with the extension. Code (workers and WebAssembly) is packaged, not downloaded, so the extension CSP allows no remote scripts. See [`docs/release/privacy-boundary.md`](../release/privacy-boundary.md).

### Page Context Script

The clipboard interceptor includes a page-world script where needed to observe paste behavior. Treat this boundary as exposed to page behavior: only pass the minimum data needed, validate messages, and avoid trusting page-provided state for security decisions.

The message that reports a page's clipboard write carries a source constant that is public, so any page script can send it. The content script therefore acts on it only while the browser reports transient user activation (`navigator.userActivation.isActive`); the extension's own `copy` event handler is not affected. This does not stop a page that copies on a real click from choosing the text. It is social engineering at most: the offer is shown in a closed overlay, the originals reach the clipboard only after the user clicks it, and a page cannot read the clipboard without a permission prompt.

### Local Model Runtime

Transformer NER runs locally using packaged model and ONNX Runtime Web assets. The release package should include reviewed local assets. Runtime code must not fetch a remote model or send model input to a remote service.

## In Scope Threats

- Accidental upload of pasted text, prompts, responses, detected entities, identity maps, vault data, feedback logs, or model input.
- Overbroad extension permissions or host access.
- Unsupported-site behavior being mistaken for supported beta protection.
- Silent Local AI degradation that leaves users with weaker detection without a clear state.
- Unsafe public issue reports containing real personal data, secrets, prompts, responses, or private documents.
- Supply-chain and license risk from bundled model/runtime assets.
- Extension storage exposure through browser profile compromise or local machine compromise.

## Non-Goals

PromptSkjold does not claim to:

- Prevent every sensitive-data disclosure.
- Provide legal or regulatory compliance.
- Protect against a compromised browser, operating system, Chrome profile, or malicious extension with broader permissions.
- Protect content after the user sends it to a third-party site.
- Support generic/custom sites in the first public beta.
- Replace organizational data-loss prevention controls.

## Controls

- Local deterministic detection runs through the bundled Rust/WASM engine.
- Local transformer detection uses packaged assets when available.
- The public beta support scope is limited to Chrome desktop stable and the supported sites listed above.
- Public docs and issue templates require synthetic or sanitized examples.
- Sensitive security/privacy reports are routed through `SECURITY.md`.
- Generated model assets, local model sources, local test corpora, and private planning docs are excluded from Git.
- Release validation must include permission review, source-boundary review, model-free checks, strict model-asset checks, manual site smoke tests, and package review.

## Residual Beta Risks

- Detection can miss sensitive content or flag harmless content.
- Supported sites can change their DOM or paste behavior without notice.
- Local AI may be unavailable on some systems or may fall back to slower CPU/WASM execution.
- Local storage persists in the browser profile until the user clears it or the extension removes it. It is **not encrypted**: the identity vault holds every original value next to its placeholder in `chrome.storage.local`. Another website or extension cannot read them, but malware, a backup or a copy of the profile can. A key stored in the same profile would add little, so there is no encryption scheme; the options are to keep cross-session memory off (the default for new installs), to clear the vault, and to use disk encryption. The feedback log stores only categories and a timestamp (no text) and deletes records after 30 days.
- Model/runtime dependencies may require renewed license and provenance review before each public release.
- File review covers only the listed file types and only attachments added by choosing, dropping or pasting on a supported site. Other types, other routes, and files with unread parts can reach a chat unchecked.
- OCR errors can hide an identifier from detection, and a blacked-out copy hides only items that were found and located.
- The attachment hand-back and the drop-zone fix are verified by automated tests and a test browser, but not on every live site; a site change can break them.
- The fine-tuned development model has an unresolved licence and must not be shipped (see `THIRD_PARTY_NOTICES.md`).
- Not yet done: a red-team exercise and an independent code review (see `TODO.md`).
- Manual Chrome Web Store upload can select the wrong artifact unless the package checksum is checked against the GitHub pre-release.
