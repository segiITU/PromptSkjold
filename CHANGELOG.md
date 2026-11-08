# Changelog

All notable public changes to PromptSkjold are documented in this file. Entries from before the fork (mentioning Privacy Guardrail) come from the upstream DFKI project.

The project follows public beta release notes for `0.x` versions.

## [Unreleased]

- Model and rules, 2026-11-07: the shipped Danish/English model is the fine-tuned "round 6a" (21.8 MB, md5 `c4d3c42f…`, see the model card at https://huggingface.co/ermias-ai/da-pii-mini-preview-21m); a second agent evaluated it independently on fresh prompts. Three small rule additions on top: (1) salary and debt amounts with GBP, NOK, SEK and CHF (`regex_recognizers.rs`); (2) a password written directly after its keyword (`Adgangskoden Køkkenhave#82 stod…`), only for values of 6+ characters with a digit or symbol, never inside a longer word such as `bad_password` and never a `key=value` pair; (3) name particles such as `í`, `van der`, `de` between two name parts join into one name (`Rói í Dali`; `joinNameParticles` in `ner-provider.ts`). A before/after run of the full pipeline on 11 test sets showed 4 more items found by the new rules (3 GBP amounts and 1 password) and 3 name mentions joined into whole names, with no new false alarms and no other change. The WASM must be rebuilt to include (1) and (2) (`crate/pkg` md5 `4dceb308…`; previous `5559393b…`). Known limits are listed in `docs/user/detected-categories-and-limitations.md`.

- Blacked-out PDFs: when some found items cannot be located on the pages, the warning ("… ville stå tilbage i kopien med sorte felter") now has a third choice, "Vedhæft som anonymiseret tekst". It attaches a `.txt` built from the text that was read, with the approved items replaced by the same placeholders as "Erstat og vedhæft" (so a reply that uses them is still resolved), and a note says that layout, pictures and signatures are not included and that reading errors may occur. Esc still means "Vedhæft ikke" (`src/content/content-script.ts`, `src/ui/image-check-dialog/`, `tests/ui/image-check-dialog.test.ts`).
- Blacked-out scans: finding a detected item on the page now tolerates common OCR misreads. `I`/`l`/`1`, `O`/`0` and `æ`/`ae`, `ø`/`oe`/`o`, `å`/`aa`/`a` are compared as the same character, and a name, address or email of 8+ characters that is one character off is matched when no exact match exists (an exact occurrence always wins, and a near one is also painted on pages that have both). Items with fewer than 2 letters, such as CPR, phone and account numbers, still need an exact match. A name or address of 8+ characters is also compared by its consonants only (`Bjørn Højeng Vesterkær` read as `Bjorn Hajeng Vesterkzer`), on words that are not painted yet and also when the item was found elsewhere on the page, so a body address read as `Fabelstreede` is covered even if the footer copy matched exactly. The detection pass renders a scan at 200 DPI and the blackout pass at 150 DPI, so the two reads of the same page differ; this is why an item can be detected but not found again. On three synthetic scanned PDFs at five scales, items not found dropped from 13 of 135 to 2 with no unrelated words painted (`src/ocr/locate.ts`, `tests/ocr/locate.test.ts`).
- Word, Excel and PowerPoint: author, company, comments and deleted text are checked along with the body, so a file whose body is clean but whose comments hold personal data is reviewed; the correction log no longer stores any text.
- Debug logging is now off by default for installs without a saved choice (it can be switched on in the popup settings); the release packaging also refuses key and certificate files.
- PDF form fields and comments are read too: text typed into a form field, comment text and its author are added to the page text and checked like the rest.
- "Dine egne sider" refuses shared hosting suffixes such as `github.io`, `pages.dev` and `vercel.app` (a single site under them, such as `alice.github.io`, is still accepted), with a Danish and English message.
- Whether a page is a built-in site is decided from its parsed host (https, default port), not by the start of its address, so addresses such as `https://claude.ai.evil.example` no longer count as Claude in the toolbar icon, the model warm-up and the "built in" label.
- The "restore originals" offer after a copy is only shown for a page-reported clipboard write while the browser reports a user gesture, so a page script cannot pop it up on its own.
- The local correction log no longer stores the text around a correction (and removes it from existing records), deletes records after 30 days, and the privacy policy now states that the vault and the log are stored unencrypted in the browser profile.
- Office files with a document type declaration or entities are refused before they are parsed, and the size an Office archive may unpack to is 40 MB (was 120 MB).
- File names are checked too: a name such as `Lønseddel_Mette_Hansen_010190.pdf` is shown in the review ("Filnavn: …") and, when you replace, the copy is attached under the cleaned name (`…[PERSON_1]…-anonymised.pdf`, or `dokument-1.pdf` for blacked-out pictures and PDFs).
- Attachments are recognised by their first bytes (PNG, JPEG, GIF, WebP, BMP, PDF, and Word, Excel or PowerPoint inside a zip), so a picture or document with no type, a wrong type or another name is still checked; images are also recognised by extension. Images that declare more than 40 megapixels are refused before they are decoded.
- Changed Word, Excel and PowerPoint copies no longer carry the file properties (author, last modified by, company), comments or tracked-deletion text, tracked changes lose their author names, Word headers, footers, footnotes and endnotes are now checked and replaced, and the review lists what is still not checked (charts, images, embedded files, custom XML, sheet names).
- Refresh the PromptSkjold interface, icons and bundled fonts; add Danish/English controls and highlighted Test-tab findings.
- Add the PromptSkjold wordmark and logo to the options page and the welcome guide, a short intro on the Beskyttelse tab and
  category icons in the review; "Husk på tværs af samtaler" is now off by default for new installs.
- Add a "Tjek Excel- og PowerPoint-filer" switch, off by default; while it is off these files are attached unchecked and a
  notice with a "Slå til" button says so. The image switch is now called "Tjek billeder og scannede filer".
- Danish phone numbers: a `+45`/`0045` number is matched in full (first digit 2-9), the generic international rule no longer
  cuts off the last digit groups or the leading `+`, bare 8-digit numbers are only phones with a phone keyword on the same
  line, and generic words such as "number" no longer count as phone keywords.
- Email addresses with Danish letters (`søren@firma.dk`) are detected; URL credentials are reported as a password; written
  `Reg. 5678 konto 9876543210` bank accounts are detected; a tab-separated number pair is no longer taken for an account
  unless `reg`/`konto` stands before it.
- Review supported image, PDF, Word, Excel, PowerPoint and text attachments by default using bundled local OCR; add Danish synthetic replacements.
- Hold prompts on detection failure, bind approval to the reviewed text and conversation, and prevent resend windows, stale pastes and cancel decisions from bypassing review.
- Keep revealed and copied originals private to the extension; serialize vault allocation and edits, with validated, conflict-safe imports.
- Intercept file selection before upload; remove formulas from anonymized Excel copies, conservatively black out PDF text runs, and reject oversized Office archives explicitly.
- Scan lowercase text, surface incomplete Local AI coverage, and target offscreen requests to prevent duplicate processing and settings races.
- Improve Danish phone and Unicode email matching while reducing order-number false positives; add training-data generators and evaluation tooling.
- Require full identifier coverage in protection metrics; reject incomplete benchmark runs, add an evaluation-only holdout, and expand browser, concurrency, scoring and CI checks. Previous protection figures require regeneration.
- Remove unnecessary permission and extension-asset exposure. Document remediation status, validation and remaining limits in CODE_REVIEW.md.

## [0.5.0] - Public Beta

- Privacy Guardrail now recognizes a chat by what is on the page instead of by its web address. It used to carry a list of what a conversation's address looks like on each site, and a site quietly changing that shape was enough to lose your replacements — which happened twice in two releases. A replacement is now filed under a conversation when it is actually seen in that conversation's messages, so a site renaming a chat, redesigning its pages, or serving you a different layout no longer costs you anything. This also works on chat sites the extension has no specific knowledge of.
- Placeholders that come back unchanged can now be restored even when Privacy Guardrail has no record of the conversation at all. Previously a chat it had lost track of offered nothing; the worst case is now that placeholders the AI has garbled — different capitalization, missing brackets — are not offered, while intact ones still are.
- Privacy Guardrail now reviews pastes on a chat page even when it no longer recognizes the site's message box, by using the box you actually pasted into. It used to let those pastes through unreviewed. The popup says quietly when it is working this way, so you can tell that something about the site has changed, and the stronger on-page warning is now reserved for pastes that genuinely were not reviewed.
- The reveal banner now appears on replies even when a site has changed how it marks them up, and its count grows as Privacy Guardrail recognizes more of the conversation instead of being fixed at the moment the banner appeared. Reveal never writes into the message box or any other field you can type in.
- Privacy Guardrail no longer stores your original values against a conversation. What it remembers about a conversation is now only which replacements were used in it; the original values live solely in the identity vault, where the options page lets you see and edit them. A conversation recorded against the wrong page can no longer reveal anything.
- With cross-session memory switched off, no original values are written to durable storage at all. They previously went to a store with no way to inspect them, which meant the setting relocated your data rather than stopping it being kept. Restoration still survives reloading a page and moving between conversations for as long as the browser is open, and nothing outlives the browser session.
- Conversations recorded by earlier versions keep working after the update. Nothing is migrated, rewritten or deleted, and conversations broken by the previous address matching start working again as soon as their placeholders are seen on the page.
- Fixed pastes not being reviewed on chat pages whose message box is inside an encapsulated editor, which read as no message box at all.
- Fixed reviewed text being inserted in the wrong place, or lost, when a site rebuilt its page while the review was running. It now goes back to the box the paste came from.
- Fixed replaced values being forgotten on ChatGPT, in the layout ChatGPT now also serves to signed-in users on the desktop. Version 0.4.2 fixed this for the classic layout, but the newer one gives a conversation a web address of a different shape, which the extension did not recognize as a conversation at all. Sending the first message therefore looked like a switch to a different chat: the replacements recorded while composing were discarded instead of moved across, so replies came back with placeholders that could no longer be turned back into your original values. Beyond the missing reveal, this also reset the numbering, so a later paste in the same chat could reuse a label such as the first person placeholder for a different person. Chats started before this fix still have their replacements filed under the "new chat" screen, but they are no longer lost: intact placeholders in those chats are recognized again from the identity vault.
- Fixed Local AI marking the wrong text in a paste, and missing most of a long one. Detected values were located by searching the paste for each fragment the model returned, so a fragment that occurs more than once could be marked at the wrong occurrence, and the surrounding words could be swept in with it. Positions now come from the model's own tokens. Long text was also split by character count rather than by how much the model can read at once, so roughly the last two thirds of a long paste was never scanned; it is now split by what the model actually reads, including a token-limit check on the final inputs when alignment needs a fallback.
- Hardened Local AI span recovery: identifier repairs preserve confident detections, email-domain repairs keep adjacent companies separate, and literal tokenizer control strings no longer shift highlights onto the wrong occurrence. Multiword confidence now considers each word instead of only the opening word.

## [0.4.2] - Public Beta

- Fixed replaced values being forgotten once a new chat got its own address. Starting a chat, pasting something that was replaced and sending it moves the page from the "new chat" screen to the conversation's own URL, and the replacements stayed filed under the screen you left — so after a reload the reply could no longer be turned back into your original values. They now move with the conversation, and switching between existing chats without a page reload loads the right conversation's replacements.
- Fixed the reveal banner missing replies that arrive in bursts. A reply that paused mid-stream for longer than half a second was only inspected up to that pause, and a reply that was still empty when first checked was written off for good — in both cases the replaced values that arrived afterwards were never offered for reveal.
- Fixed Privacy Guardrail not recognizing the message box on ChatGPT when signed out, so no review was offered before pasting. That ChatGPT layout renders the message box as a plain text field instead of the rich editor the extension was built against. Both layouts are now recognized, and pasting keeps the cursor where you left it in either.
- Fixed the de-anonymization banner not appearing on ChatGPT replies in that same layout.
- Fixed chat sites added by a later release staying inactive for existing installs. The list of supported sites is kept in your settings, and once it had been written it was never reconciled with the sites a newer version knows about — so on a newly supported site the toolbar icon stayed inactive and Local AI never warmed up, while pastes were still reviewed. Updating now adds the sites a release brings with it, without dropping anything already in the list.
- Privacy Guardrail now tells you when it cannot find a chat page's message box. Chat sites change their layout, and when one changes enough that the extension no longer recognizes where you type, pastes went through without review while the extension still looked healthy. Pasting into a page it cannot attach to now shows a warning on the page and a status note explaining that pastes there are not reviewed, until reloading the page restores it.
- Privacy Guardrail now tells you when it has switched itself off. If it fails to start on a page, pastes are no longer reviewed for the rest of that page's visit, and it previously gave no sign of this at all — so you could keep pasting while believing you were covered. It now shows a warning on the page and asks you to reload.
- Renamed the **Intercept clipboard** setting to **Intercept copy**. It only ever governed the offer to restore original values when you copy text out of a chat; it never affected the review of text you paste, which follows the master protection toggle. The old name suggested it covered both directions.
- The privacy policy now has a Clipboard Access section spelling out when the extension reads or writes clipboard content, that it holds no clipboard permissions, and that it runs only on the supported chat sites.

## [0.4.1] - Public Beta

- Reduced the packaged extension from about 408 MB to about 167 MB by shipping the optimized Local AI model. Version 0.4.0 added the tooling for this but still packaged the unoptimized model assets.
- The bundled tokenizer is now 5.6 MB instead of 16.8 MB, and the 4-bit model weights 167 MB instead of 433 MB, because the model vocabulary is restricted to Latin, Greek, and Cyrillic scripts and word embeddings are stored as int8.
- Local AI's vocabulary now covers Latin, Greek, and Cyrillic only. Names and addresses written in other scripts, for example Chinese, Japanese, or Arabic, are less likely to be flagged by Local AI. Pattern detection is unchanged.
- Corrected documentation that still described a selectable full-precision (fp16) model. The extension ships a single 4-bit (q4f16) build for both the WebGPU and the CPU/WASM path.

## [0.4.0] - Public Beta

- Fixed ChatGPT paste interception so the local review flow blocks the native paste before the user approves it.
- Reduced the shipped Local AI package size by deduplicating WASM assets, pruning the tokenizer vocabulary, and quantizing embedding weights to int8.
- Added reproducible tooling and documentation for preparing the optimized BardsAI model assets.

## [0.3.2] - Public Beta

- Added terms of use, release legal notices, and packaged legal documents for GitHub release artifacts
- Surfaced legal and support links in the popup and options UI

## [0.3.1] - Public Beta

- Reused the stored system compatibility check for WebGPU detection, avoiding an extra adapter probe that could fail while Local AI loads
- Improved the supported-page status chip: Local AI model load failures now show the underlying error detail, and CPU fallback is surfaced when Local AI is running without WebGPU
- Made content-script runtime messages best-effort so stale page scripts do not surface errors after the extension is reloaded
- Clarified privacy policy and Chrome Web Store listing wording

## [0.3.0] - Public Beta

Version 0.2.4 was an internal version bump that was never published; its changes are included here.

- Reduced Local AI memory use: both WebGPU model files now ship in ONNX external-data format, removing the multi-gigabyte memory spike while the model loads
- Added a GPU model precision choice to the Local AI model picker (popup and options page): a compact 4-bit (q4f16) default that keeps Local AI around 1 GB of RAM while loaded, and a full-precision (fp16) option that uses slightly more RAM and roughly twice the GPU memory
- Switching the model or precision now reloads Local AI immediately so the change takes effect right away
- Added automatic Local AI warmup while active on a supported chat page on capable systems, with options to control retention and the inactivity unload timeout
- Surfaced raw Local AI model labels in debug output
- Migrated toast notifications to the design system
- Updated privacy and legal disclosures

## [0.2.3] - Public Beta

- Added BETA badge to the popup and options page headers
- Filled in Impressum legal notice with provider, project, and DPO contacts
- Adjusted accent color
- Removed the GitHub Actions CI workflow (validation runs locally via `npm run validate:ci`)

## [0.2.2] - Public Beta

- Shortened extension description to fit the Chrome Web Store 132-character limit

## [0.2.1] - Public Beta

- Reframed extension description and popup messaging
- Added Impressum / legal notice link to README

## [0.2.0] - Public Beta

Initial public beta placeholder.

Planned release notes will cover:

- Chrome desktop beta support for ChatGPT, Claude, and Gemini.
- Local assistive PII review before paste.
- Pattern-based detection and optional packaged Local AI detection.
- Local placeholder mapping and restoration support where available.
- Public documentation for privacy, security, support, contribution, and release workflows.

This beta does not guarantee complete detection, prevention of disclosure, or regulatory compliance.
