# Synthetic Excel and PowerPoint examples

`syntetisk-testdata.xlsx` and `syntetisk-testdata.pptx` are example files for the extension's file checking. **Every value
in them is made up** (names, e-mail addresses at syntetisk-firma.test / ermias.ai, phone numbers, CPR numbers, IBAN, address, IP);
each file says "Syntetisk testdata" in its first cell / on its first slide. Never put real personal data in these files.

They are generated, deterministically (fixed timestamps), by `generate.js` in this folder, which only needs `fflate`:

```
node tests/fixtures/office/generate.js                 # rewrites both files here
node tests/fixtures/office/generate.js --big <dir>     # also writes syntetisk-stor.pptx (~8 MB, noise images) into <dir>
```

**Hidden-data files** (`skjult-word.docx`, `skjult-excel.xlsx`, `skjult-powerpoint.pptx`, made by `generate-hidden.js`): the body
is clean on purpose, and the made-up personal data sits only in the document author and company, comments, a tracked deletion
and (Word) a header and footer. Attach one on a chat site to see that it is flagged because of the hidden text, and that the
replaced copy no longer carries the author, company, comments or deleted text. Covered by `tests/files/office-hidden-fixtures.test.ts`.

The big variant is not kept in the repository (size); it is for timing checks.

What is in them:

| | xlsx | pptx |
|---|---|---|
| structure | 3 sheets (one **hidden**), merged title cell, shared and inline strings, numbers, a formula cell with a cached text result | 4 slides, text boxes, a table, **speaker notes** on two slides |
| data | names, e-mails, +45 phones (incl. `tlf. 61 23 45 67`), CPR `111111-1111` and others with valid dates, IBAN, `Reg. 5678 konto 9876543210`, address, IP `192.168.10.24`, a date of birth | the same kinds, spread over slides, table cells and notes |
| not personal data (must not be flagged) | `Ordrenummer 12345678`, budget numbers | `Ordrenummer 12345678`, budget numbers |

The files are minimal OOXML packages built by hand for text extraction and replacement; they have not been opened in
Microsoft Office. They are covered by `tests/files/office-fixtures.test.ts` and the real-extension spec
`e2e/live/office-fixtures.spec.ts`. The OCR example images the e2e specs use live outside the repository
(`OCR_TEST_FILES`); `tests/fixtures/site-dom/` holds page snapshots, so this is the first in-repo folder of file examples.
