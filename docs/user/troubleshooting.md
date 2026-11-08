# Troubleshooting

PromptSkjold public beta support is scoped to Chrome desktop stable and:

- `chatgpt.com`
- `chat.openai.com`
- `claude.ai`
- `gemini.google.com`
- `copilot.microsoft.com` and `copilot.com`

## Extension Looks Inactive

- Confirm the extension is installed and enabled in `chrome://extensions`.
- Refresh the supported chat tab after installing or updating.
- Confirm you are on one of the supported beta sites.
- Open the extension popup and check whether protection is enabled.

## Paste Was Not Reviewed

- Very short pasted text may not trigger a scan.
- Unsupported sites are outside the beta scope.
- Pattern-only mode may find no supported structured spans.
- Category settings, allowlist entries, or sensitivity settings may suppress detections.

## An Attached File Was Not Checked

- File review is on by default. If attachments go through unchecked, check that "Tjek billeder og scannede PDF'er" is switched on in the popup or the options page.
- Only the file types listed in [Detected Categories And Limitations](detected-categories-and-limitations.md) are read. Old `.doc`, `.xls`, `.ppt` and other types are passed on unchecked.
- Files over the size limits (images 15 MB, PDF 25 MB, Word 15 MB, text 5 MB, Excel and PowerPoint 15 MB) are not read.
- Reload the extension at `chrome://extensions` and refresh the chat tab after updating.

## "Image Could Not Be Checked" Or "File Could Not Be Fully Checked"

The dialog says why. Common reasons are a scan that OCR could not read (very low quality, photo, rotated page), a PDF with more pages than the limits allow, or a damaged file. You can attach the file anyway or leave it out. A cleaner scan or a screenshot usually reads better.

## A Drop Zone Stays On Screen After Dropping Files

Some chat sites show a "drop files here" layer while you drag. If it stays after a drop, refresh the tab and tell us which site it was. The extension sends the page a "drag ended" signal after it holds back a drop, but this has been tested only with automated tests and not yet on every site.

## Only Some Highlights Are Kept At A High Confidence Setting

The confidence slider compares the whole percentages shown in the Entities list. An item shown as 100% (for example a true 99.6%) is kept at a 100% setting.

## Local AI Is Unavailable Or Failed

- Open the extension popup or options page and check Local AI status.
- Refresh the supported chat tab.
- Try a smaller paste.
- Close unused tabs if Chrome is under memory pressure.
- If Local AI remains unavailable, treat protection as degraded and review the text manually.

Pattern-based detection can still run when Local AI is off or unavailable, but coverage is narrower.

## Local AI Loads Or Unloads Unexpectedly

- On capable systems, Local AI can warm automatically while you are active on a supported chat page. Capable means more than 4 GB browser-reported memory, passive WebGPU available, and no known CPU/WASM fallback.
- Background tabs do not keep Local AI loaded.
- Turning Local AI off unloads the Local AI runtime; pattern detection remains active.
- By default, Local AI unloads after 10 minutes of inactivity. You can change the timeout or disable active-page warmup in options.

## Browser Is Slow

- Wait for the scan to finish or cancel the scan.
- Try pasting a shorter section.
- Close unused tabs or apps.
- Check whether the extension is using CPU/WASM fallback instead of WebGPU.
- If Local AI is still too heavy, turn off active-page warmup or turn Local AI detection off in options. Pattern detection continues to run.

## Unsupported Site Expectations

PromptSkjold does not yet support generic or custom sites, and you cannot add your own site in this beta (it is on the to-do list). If you need support for another site, file a feature request with synthetic examples and explain the workflow without sharing private content.

## Console Error Collection

For a useful bug report:

1. Reproduce the issue with synthetic text.
2. Open Chrome DevTools on the supported chat tab.
3. Check the Console for extension errors.
4. Copy only non-sensitive error text.
5. Remove real personal data, secrets, prompts, responses, private documents, and confidential logs before posting.

Use private security reporting for anything that could expose sensitive data.
