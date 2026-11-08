# How To Use PromptSkjold

PromptSkjold reviews pasted text locally before it is inserted into a supported LLM chat page.

Supported beta sites:

- `chatgpt.com`
- `chat.openai.com`
- `claude.ai`
- `gemini.google.com`
- `copilot.microsoft.com` and `copilot.com`

## Paste Review

1. Copy text you want to paste.
2. Paste into a supported chat input.
3. If the paste is long enough to scan, PromptSkjold checks it locally.
4. Review the detected spans before insertion.
5. Keep the spans you want anonymized and ignore spans you do not want changed.
6. Confirm the reviewed paste.

When no supported span is found, the extension allows the paste without showing the full review overlay.

## Attaching Files and Images

This is on by default. You can switch it off with **Tjek billeder og scannede PDF'er** in the popup (Protect tab) or on the options page. The Danish and English text-recognition data is part of the extension, so nothing is downloaded. Nothing you attach is sent anywhere by PromptSkjold.

While it is on, when you choose, drop or paste a file in a supported chat, the file is held back and checked on your computer:

1. A short "Reading…" indicator shows while the file is read. Scanned PDFs and big images take a few seconds.
2. If nothing personal is found, the file is attached as normal.
3. If something is found, a review opens, the same as for pasted text. The file name is shown at the top. **Original** shows the text with the found items underlined in the colour of their category; **Entities** lists them. Click an underlined item to remove it from the list ("Entity removed"); click again to put it back. The confidence slider keeps items whose shown percentage is at or above the slider.
4. Choose what to attach: the file with the items replaced, a blacked-out copy (images and PDFs up to 20 pages), the original, or nothing.

What you get for each type:

- **Images** open with the found text highlighted. **Blacked out** shows a preview of the copy, saved as a `-redacted.png`.
- **PDFs** open as text. You can attach a text file with the items replaced (`name-anonymised.txt`) or a PDF with the found items blacked out. The blacked-out PDF is rebuilt from page pictures, so the text in it cannot be selected or searched.
- **Word (.docx)** keeps its format; the items are replaced in the text.
- **Plain-text files** (txt, csv, tsv, md, log, json, xml, html, yaml, ini, eml, vcf, ics) keep their format. In csv and tsv files, replacements never contain a comma, quote or line break that would break a cell.

If you attach several files at once, the first is checked straight away and the others are checked in the background while you review it. Each file's name is shown above its review.

If a file cannot be read, or only part of it could be checked, a dialog titled "Image could not be checked" or "File could not be fully checked" says why and lets you attach it anyway or leave it out. Pages beyond the limits in [Detected Categories And Limitations](detected-categories-and-limitations.md) are not checked, and the dialog says so.

## Language of Replacements

In realistic mode, personal data is replaced by invented values. Under **Language of replacements** in the options you can choose Danish, English, or **Match the text** (the default). Danish replacements use invented names, towns and organisations. They are chosen to be unlikely to match a real person or company, but this is not guaranteed. Numbers are generic and count up, so each person stays distinguishable: for example a CPR number becomes `123456-7890`, then `123456-7891`; a phone number `+45 12345678`; a postcode `1234`.

## Placeholders

Accepted spans are replaced with typed placeholders such as:

```text
[EMAIL_1]
[PERSON_1]
[CREDIT_CARD_1]
```

The placeholder map is stored locally so that supported responses can be restored later. Placeholder numbering is stable for the local identity vault where the same original value is reused.

## Ignoring Detections

The review UI lets you ignore a detection for the current paste when it is not sensitive in context. Ignored text is pasted unchanged.

For repeated false positives, use the extension settings to add allowlist entries or adjust category sensitivity.

## Restoration

On supported chat pages, PromptSkjold watches model responses for placeholders and restores known originals locally where supported. Restoration depends on the local placeholder or vault record still being available. If the model rewrites a placeholder heavily, restoration may be incomplete.

## Canceling A Scan

If a scan is taking too long, use the cancel control. Depending on your settings, the extension may ask whether to paste the original text or drop the pending paste.

PromptSkjold is an assistive beta tool. Review the final text yourself before sending it.
