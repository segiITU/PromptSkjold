# Manual testing guide

Everything below uses **fictional** data. Nothing you type is sent anywhere by the extension; detection runs
in your browser. (The chat site you test on will of course receive whatever you actually send.)

## 1. Install the unpacked extension

1. `dist/` is already built (re-build any time: `npm run build:ext` from PowerShell, see `FORK_NOTES.md`).
2. Chrome: open `chrome://extensions`, switch **Developer mode** on, **Load unpacked**, pick the `dist` folder.
   Edge: `edge://extensions`, same steps.
3. After rebuilding, click the reload arrow on the extension card **and reload the chat tab**.
4. Open `https://claude.ai` or `https://chatgpt.com` (signed in as usual). Gemini is also in the manifest.
5. Pin the extension icon. The popup shows protection status and the Local AI state ("BardsAI mini ... is ready").
   The first scan after browser start loads the model (about 1 s on a fast machine).

Useful windows while testing:

- Page console (F12 on the chat tab): content-script logs begin with `[PG:content]`.
- `chrome://extensions` > extension card > **service worker** link: background logs `[PG:...]`.
- The model runs in an offscreen document (`chrome://inspect/#other` lists it): `[PG:ner]` and `[PG:offscreen]` logs,
  including `long paste mode` coverage lines.

## 2. What should happen

| You do | Expected |
| --- | --- |
| Type a prompt with personal data and press **Enter** or click **send** | The message is held, a scanning chip appears, then the review overlay lists what was found with categories. Nothing reaches the chat service until you decide. |
| Prompt has no personal data | Sent as normal after a short scan (a fraction of a second). |
| In the overlay choose anonymize | The composer text is replaced with placeholders (`[PERSON_1]`, `[EMAIL_1]`, ...) and then sent. Replies containing those placeholders can be revealed with the banner. |
| Overlay: send original / cancel | Original is sent / nothing is sent and your text stays in the box. |
| Paste large text | Paste is held, scanned, and the review overlay appears. |
| Very large paste (>20,000 characters) | Pattern checks cover everything; the AI name/address check skips text without capitalised words and stops at a 20 s budget. If it could not read everything you get a notice ("AI name/address check covered ~N%"). |
| Scan fails | Fail closed: "message NOT sent". Press send again within 15 s to send without scanning. |

## 3. Prompts to try (copy and paste)

Danish
- `Skriv en mail til Mette Sørensen på mette.sorensen@gmail.com om hendes ansøgning hos Nordlys Consulting ApS`
- `Mit CPR-nummer er 010190-1234, kan du hjælpe med blanketten?`
- `Jeg hedder Søren Hansen og bor på Vestergade 12, 3. th., 8000 Aarhus C. Ring på +45 20 12 34 56`
- `Overfør 5.000 kr. til IBAN DK50 0040 0440 1162 43`
- `Min adgangskode til systemet er Sommer2024! – er den stærk nok?`
- `Patient: Lars Pedersen, CPR 140582-4417. Diagnose: type 2-diabetes. Skriv et journalnotat.`

English
- `Write an email to Emily Walker at emily.walker@hotmail.com about her application to Bluewave Solutions Ltd`
- `My card number is 4111 1111 1111 1111, can you check the format?`
- `Debug this: auth fails with key sk-proj-abcdefghijklmnopqrstuvwxyz0123456789ABCD`
- `DB_URL=postgres://admin:Pa55w0rd@db.internal:5432/prod — why does this time out?`

New identifier types (keyword-anchored, so the label word must be next to the value)
- `Mit pasnummer er 123456789` / `Kørekortnummer: 12345678` / `Passport no: X1234567`
- `Jeg er født 14. maj 1982 i Aarhus` / `Date of birth: 1982-05-14` / `Fødested: Odense`
- `Titel: Senior Software Engineer` / `Jeg arbejder som sygeplejerske` / `She works as a project manager`
- `Min løn er 45.000 kr om måneden` / `Jeg har en gæld på 2 millioner kr` / `Salary: $85,000`
- Should NOT flag: `The script works as expected`, `Passport CONTROL is closed`, `Mødet er den 14/05/1982`, `Hun er født i Danmark`

Should NOT interrupt (these are the false-alarm checks)
- `Hvad er hovedstaden i Australien?`
- `Order number 4829104473 has shipped` / `Fakturanr. 2024-01234 forfalder den 15. november`
- `What's the difference between version 2.19.20 and 3.0.1?`
- `Tell me about H.C. Andersen` (known: public figures ARE flagged; allowlist them)
- `Kan du forklare forskellen på ApS og A/S?`

Tricky formats (expected to be hard)
- `Min mail er soeren.hansen snabel-a gmail punktum com` (obfuscated emails are usually missed)
- CPR with a dot: `140182.8575`; lowercase typed names: `jeg hedder peter hansen`
- Sensitive topic with no identifiers: `Jeg har fået konstateret type 2-diabetes og er bange for at fortælle det til min leder` (not expected to be flagged: this tool detects identifiers, not subject matter).

## 4. Large pastes

The long sample files used during development are not part of the repository. To test large pastes, build your own from the prompts in section 3: repeat them (a few kilobytes, then about 50 and 200 kilobytes) and mix in filler text, a CSV table of fictional people, or log lines with a single hidden identifier.

For each size note the seconds from paste or Enter to the overlay, whether the browser tab stayed responsive, and whether the partial-coverage notice appears on the largest pastes (the page must stay responsive).

## 5. Things the extension does NOT cover (so you can try to break them)

- **Attachments / uploads**: only the file types listed in the README are checked (and Excel/PowerPoint only when switched on); voice input and other routes the extension does not see are not.
- **Edit-message boxes** and other composers the site adapter does not recognise.
- **Ctrl+Enter-to-send** users: plain Enter is held either way.
- Real send-button selectors for chatgpt.com, claude.ai, gemini.google.com are best guesses: if clicking **send** is NOT
  held on a site, that is exactly what to report (page, what you clicked).
- Text typed by browser autofill/dictation may reach the box without going through the keyboard events.

## 6. If something looks wrong

- Tell me: site, exact steps, what you expected, what happened, and (if it is a missed detection) the text.
  Do not paste real personal data into a bug report.
- Check the popup: is protection on and is Local AI "ready"? If the model state is unavailable, only pattern rules run.
- Settings (options page) let you toggle categories and sensitivity; "Low-signal" (dates, URLs) is off by default.
