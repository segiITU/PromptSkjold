# Detected Categories And Limitations

PromptSkjold detects a beta set of structured and free-text personal or sensitive data categories before paste.

Supported beta sites:

- `chatgpt.com`
- `chat.openai.com`
- `claude.ai`
- `gemini.google.com`
- `copilot.microsoft.com` and `copilot.com`

## Categories

| Group | Categories |
| --- | --- |
| Identity | `PERSON`, `USERNAME` |
| Contact | `EMAIL`, `PHONE`, `ADDRESS` |
| Financial | `CREDIT_CARD`, `IBAN`, `BANK_ACCOUNT`, `SSN` |
| Network | `IP_ADDRESS` |
| Location | `LOCATION` |
| Password | `PASSWORD` |
| Organization | `ORGANIZATION` |
| Low-signal | `URL`, `DATE`, `MISC` |

Low-signal categories can be noisy and may be disabled by default or tuned in settings.

## What Pattern Detection Handles Best

Pattern recognizers are strongest when the text has a stable format, such as email addresses, credit card numbers, IBANs, IP addresses, and some phone numbers.

## What Local AI Helps With

Local AI can help identify context-sensitive spans such as person names, organizations, addresses, locations, usernames, passwords, and miscellaneous sensitive phrases. It can still miss spans or flag harmless text.

## Files And Images

When file review is turned on (options, "Check images and PDFs"), these limits apply.

| File type | Read | Limits |
| --- | --- | --- |
| Images: png, jpeg, webp, bmp, gif | OCR | 15 MB. Longest side is scaled down to 3,500 px. |
| PDF | Text layer, and OCR for scanned pages | 25 MB. Text read from up to 500 pages; OCR on the first 20 scanned pages; blacked-out copy up to 20 pages. |
| Word (`.docx`) | Body text | 15 MB. |
| Excel (`.xlsx`) | Text and numbers in every sheet, row by row | 15 MB. Changed cells become plain text and the original value is removed from the file. |
| PowerPoint (`.pptx`) | Slide text, speaker notes, SmartArt text | 15 MB. |
| Plain text: txt, csv, tsv, md, markdown, log, json, xml, html, htm, yaml, yml, ini, eml, vcf, ics | The text | 5 MB. |

**Not read** (the file is passed on without a check): OpenDocument files, old Office files (`.doc`, `.xls`, `.ppt`), `.rtf`, `.heic`, `.tiff`, archives, and any other type. Word headers, footers, footnotes and comments, Excel and PowerPoint comments and charts, and the author and title stored inside Office files are also not read.

Other things to know:

- OCR reads Danish and English. It is good on clean scans and screenshots, and weak on photos, handwriting, curved or rotated pages, and very small text. A misread word can hide an identifier from detection (for example `Anszttelsesnr: 004582`).
- Faces, signatures, fingerprints and logos in images are not detected.
- Blacked-out images and PDFs hide only what was found and located. A found item that OCR could not locate on the page is reported in the review and would stay visible. Check the preview.
  - Matching tolerates the usual OCR slips: `I`/`l`/`1`, `O`/`0` and a lost or swapped `æ`, `ø` or `å` count as the same character, and a name, address or email that is one character off is still found. Numbers (CPR, phone, account) must match exactly, so a number OCR misread stays reported rather than guessed.
  - When some items still cannot be located in a PDF, the warning offers "Vedhæft som anonymiseret tekst": a `.txt` made from the text that was read, with the items replaced. It is a transcription, not the document: layout, pictures and signatures are missing, and OCR reading errors in other text (such as amounts) are carried over. Check it before relying on it.
- A blacked-out PDF is made of page pictures, so it is larger and cannot be searched. Its original metadata is not copied.
- Files added by a route the extension does not see are not checked. The extension watches choosing, dropping and pasting files on the supported sites.
- Detection in a file has the same limits as detection in pasted text.

## Known Limits

- Detection can miss sensitive content.
- Detection can flag text that is not sensitive in context.
- Ambiguous words, short names, code, tables, and unusual formatting can reduce quality.
- Names are found best when typed normally. Names typed in all lowercase, with spelling mistakes, or as speech-to-text (no punctuation, numbers written out) are missed more often, and so are some multi-part names with particles (`victor de la motte`).
- Names that are also public figures, brands, product or pet names are flagged as people. This is deliberate: it is safer to ask than to miss a private person with the same name, and you can leave them unchanged in the review.
- Long job titles (`teamleder for løn og personale`) can be marked only in part, and salary or debt amounts in table rows or less common currencies can be missed.
- Only Latin-script names are read well; Arabic, Cyrillic and other scripts are largely not recognised.
- In an independent test on 260 prompts written in many voices (teenagers, older users, non-native writers, parents, small businesses), about 85% of prompts with personal data were fully covered and about 40% of harmless casual prompts were flagged. On business-style prompts the figures were about 93% and 6%. These are small samples; see `research/codex-eval/`.
- Local AI can be unavailable, slow, or degraded depending on browser and device resources.
- Restoration depends on local placeholder or vault records and may not handle every response rewrite.
- Unsupported sites are outside the first public beta scope.

PromptSkjold supports local review before sending. It does not guarantee perfect detection, prevention, or regulatory compliance.
