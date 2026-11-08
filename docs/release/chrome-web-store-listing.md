# Store Listing Copy (Chrome Web Store and Edge Add-ons)

Upload-ready copy and permission justifications for PromptSkjold `0.5.0`. The upload itself is manual: this document only prepares the text the operator pastes into the Chrome Developer Dashboard and the Edge Partner Center.

**Before you paste:** the claims below were written from the code and `CHANGELOG.md`. Submit interception, file attach and Copilot on the live sites were still being checked by hand when this was written. Remove or soften any sentence your live test does not back up.

**URLs to create on ermias.ai** (proposed paths; change them here and in `src/shared/project-links.ts` if you pick others): `/promptskjold`, `/promptskjold/privacy`, `/promptskjold/terms`, `/promptskjold/impressum`. Ready-made HTML for the last three is in `release/site/` (see the end of this file).

## Item Name

```
PromptSkjold
```

## Short Description (max 132 characters)

```
Review and replace personal data before you send it to AI chats. Danish and English. Runs locally in your browser.
```

Danish (store locale `da`):

```
Gennemse og erstat personoplysninger, før du sender dem til AI-chats. Dansk og engelsk. Kører lokalt i din browser.
```

## Category

```
Productivity
```

## Detailed Description (English)

```
PromptSkjold – check what you share with AI chats

PromptSkjold helps you notice personal and sensitive information in your text and files before you send them to an AI chat. You see what was found, choose what to replace, and the chat receives placeholders such as [PERSON_1] instead of the real values. Everything runs locally in your browser. Nothing you type, paste, attach or review is uploaded by this extension, and there is no telemetry or analytics.

Built for Danish first, with English support. It recognises Danish formats such as CPR numbers, phone numbers, reg./account numbers and IBANs, together with names, addresses, e-mail addresses, organisations, job titles and other personal details.

WHAT IT DOES

• Checks text you paste or send on supported chat sites and shows a review step before it goes out.
• Highlights what it found. You accept or ignore each item and replace the rest with placeholders (or realistic synthetic values).
• Reads images, scanned PDFs, PDFs, Word and text files with built-in Danish and English OCR, and attaches a copy with the found items blacked out or replaced. Excel and PowerPoint files can be switched on in the settings.
• Checks file names too, so a name like Lønseddel_Mette_Hansen.pdf does not leak what the file contains.
• Keeps a local identity vault so the same value gets the same placeholder in a conversation, and can restore the original values in the reply on your screen.
• Combines fast pattern rules (with checksums) with a small AI model, about 22 MB, that is packaged inside the extension and runs on your computer.
• Holds the message instead of sending unchecked text if the check cannot run.

SUPPORTED CHAT SITES

• ChatGPT (chatgpt.com, chat.openai.com)
• Claude (claude.ai)
• Gemini (gemini.google.com)
• Microsoft Copilot (copilot.microsoft.com, copilot.com)

You can add other chat sites yourself under "Dine egne sider" in the settings. The browser asks you for permission for each site, one at a time. PromptSkjold never gets access to other sites on its own, and only the built-in sites are tested by the project.

PRIVACY

• No telemetry, no analytics, no remote feedback collection.
• No upload of text, files, detected items, vault data or logs. The model, the OCR data and the runtime are inside the extension; nothing is downloaded.
• "Remember across conversations" is off by default. Settings and the optional vault are stored only in your browser profile on your device.
• Full privacy policy: https://ermias.ai/promptskjold/privacy

PLEASE READ – LIMITS

PromptSkjold is an aid, not a guarantee, and not a compliance or data-loss-prevention product. This is a public beta.
• It can miss personal data and it can flag harmless text. Always read the review before you send.
• Strongest in Danish and English. Names in other scripts (for example Arabic or Chinese), speech-to-text output, text with many typos and names that are also brand names or public figures are less reliable.
• Files of other types than those listed are attached unchecked; you get a notice when that happens.
• Text inside scanned images depends on OCR quality.
• Other chat sites that you add yourself use a generic adaptation and may work less well than the built-in ones.
If sharing personal data with an AI service would have serious legal, financial or safety consequences for you, do not rely on this extension as your only safeguard.

REQUIREMENTS

Chrome or Edge on desktop, current version. Works on ordinary computers: the model runs on the CPU, and the first check after starting the browser takes about a second while it loads.

ABOUT

PromptSkjold is made by Sebastian Gilson (ermias.ai). It is open source and builds on Privacy Guardrail from the German Research Center for Artificial Intelligence (DFKI), used under the Apache License 2.0. DFKI does not operate or endorse PromptSkjold.

Website: https://ermias.ai/promptskjold
Privacy policy: https://ermias.ai/promptskjold/privacy
Terms: https://ermias.ai/promptskjold/terms
Legal notice: https://ermias.ai/promptskjold/impressum
Contact: kontakt@ermias.ai
```

## Detailed Description (Danish)

```
PromptSkjold – tjek, hvad du deler med AI-chats

PromptSkjold hjælper dig med at opdage personoplysninger og følsomme oplysninger i din tekst og dine filer, før du sender dem til en AI-chat. Du ser, hvad der er fundet, vælger hvad der skal erstattes, og chatten får pladsholdere som [PERSON_1] i stedet for de rigtige værdier. Alt kører lokalt i din browser. Intet, du skriver, indsætter, vedhæfter eller gennemser, uploades af udvidelsen, og der er ingen telemetri eller statistik.

Lavet til dansk først, med understøttelse af engelsk. Den genkender danske formater som CPR-numre, telefonnumre, reg.- og kontonumre og IBAN samt navne, adresser, e-mailadresser, organisationer, jobtitler og andre personlige oplysninger.

HVAD DEN GØR

• Tjekker tekst, du indsætter eller sender på understøttede chatsider, og viser et gennemsyn, før den sendes.
• Fremhæver det fundne. Du godkender eller ignorerer hvert punkt og erstatter resten med pladsholdere (eller realistiske syntetiske værdier).
• Læser billeder, scannede PDF'er, PDF'er, Word- og tekstfiler med indbygget dansk og engelsk tekstgenkendelse (OCR) og vedhæfter en kopi, hvor det fundne er sort overstreget eller erstattet. Excel- og PowerPoint-filer kan slås til i indstillingerne.
• Tjekker også filnavne, så et navn som Lønseddel_Mette_Hansen.pdf ikke afslører, hvad filen indeholder.
• Har en lokal identitetsboks, så samme værdi får samme pladsholder i en samtale, og kan sætte de originale værdier tilbage i svaret på din skærm.
• Kombinerer hurtige mønsterregler (med kontrolciffer) med en lille AI-model på cirka 22 MB, som ligger i selve udvidelsen og kører på din computer.
• Holder beskeden tilbage i stedet for at sende utjekket tekst, hvis tjekket ikke kan køre.

UNDERSTØTTEDE CHATSIDER

• ChatGPT (chatgpt.com, chat.openai.com)
• Claude (claude.ai)
• Gemini (gemini.google.com)
• Microsoft Copilot (copilot.microsoft.com, copilot.com)

Du kan selv tilføje andre chatsider under "Dine egne sider" i indstillingerne. Browseren spørger om tilladelse til hver side for sig. PromptSkjold får aldrig selv adgang til andre sider, og kun de indbyggede sider er testet af projektet.

PRIVATLIV

• Ingen telemetri, ingen statistik, ingen indsamling af feedback.
• Ingen upload af tekst, filer, fundne punkter, identitetsboks eller logfiler. Modellen, OCR-data og kørselsmiljøet ligger i udvidelsen; der hentes intet.
• "Husk på tværs af samtaler" er slået fra som standard. Indstillinger og den valgfrie identitetsboks gemmes kun i din browserprofil på din enhed.
• Fuld privatlivspolitik: https://ermias.ai/promptskjold/privacy

LÆS VENLIGST – BEGRÆNSNINGER

PromptSkjold er et hjælpemiddel, ikke en garanti, og ikke et compliance- eller DLP-produkt. Det er en offentlig beta.
• Den kan overse personoplysninger, og den kan markere harmløs tekst. Læs altid gennemsynet, før du sender.
• Stærkest på dansk og engelsk. Navne i andre skriftsystemer (fx arabisk eller kinesisk), tale-til-tekst, tekst med mange tastefejl og navne, der også er mærkenavne eller offentlige personer, er mindre pålidelige.
• Andre filtyper end de nævnte vedhæftes uden tjek; du får en besked, når det sker.
• Tekst i scannede billeder afhænger af OCR-kvaliteten.
• Andre chatsider, du tilføjer selv, bruger en generel tilpasning og virker måske dårligere end de indbyggede.
Hvis det ville have alvorlige juridiske, økonomiske eller sikkerhedsmæssige følger for dig at dele personoplysninger med en AI-tjeneste, så lad være med at stole på udvidelsen som eneste sikring.

KRAV

Chrome eller Edge på computer, nyeste version. Virker på almindelige computere: modellen kører på processoren, og det første tjek efter browserstart tager cirka et sekund, mens modellen indlæses.

OM PROJEKTET

PromptSkjold er lavet af Sebastian Gilson (ermias.ai). Det er open source og bygger på Privacy Guardrail fra Deutsches Forschungszentrum für Künstliche Intelligenz (DFKI) under Apache License 2.0. DFKI driver eller anbefaler ikke PromptSkjold.

Websted: https://ermias.ai/promptskjold
Privatlivspolitik: https://ermias.ai/promptskjold/privacy
Vilkår: https://ermias.ai/promptskjold/terms
Juridisk information: https://ermias.ai/promptskjold/impressum
Kontakt: kontakt@ermias.ai
```

## Single Purpose Statement

```
Let the user review and replace personal or sensitive data in text and attached files, locally in the browser, before they are sent to AI chat sites.
```

## Permission Justifications

These match `manifest.json` and `docs/release/chrome-permissions.md`. Paste each into the matching dashboard field.

### `storage`

```
Stores the user's settings, the optional local identity vault (so the same value keeps the same placeholder in a conversation), allow/block lists, the list of chat sites the user added, and a short local correction log, in extension storage on the device. Nothing is sent anywhere.
```

### `offscreen`

```
Runs the local detection model (WebAssembly and ONNX Runtime) and the OCR engine in an offscreen document. A Manifest V3 service worker cannot host this long-running work, so an offscreen document is needed to keep all detection on the device.
```

### `scripting`

```
Used only to register the page scripts for a chat site that the user adds themselves under "Dine egne sider", after the browser has shown its permission prompt for that one site. Removing the site unregisters the scripts. It is never used on other sites.
```

### `activeTab`

```
When the user opens the toolbar popup, the extension reads the address of the current tab (not its content) so it can offer a button "Tilføj denne side" to add that site. The address is shown in the popup and is not stored unless the user adds the site.
```

### Host permissions (one combined entry)

```
The extension runs on six built-in chat sites: chatgpt.com, chat.openai.com, claude.ai, gemini.google.com, copilot.microsoft.com and copilot.com. Access is needed to inject the content scripts that check what the user pastes, types and sends, and the files they attach, and to show the review dialog on those pages. All checking runs locally. No other sites are matched.
```

### Optional host permission (`https://*/*`)

```
Declared as optional and not granted at installation. It is requested for one site at a time, only when the user presses "Tilføj" for a chat site of their choice, and the browser shows its own prompt. It lets the extension run the same checks on that one site. The extension never scans pages to look for chat sites, and the permission for a site is handed back when the user removes it.
```

### Remote code use

```
None. The extension loads no remote code. The detection model, ONNX Runtime, the OCR engine with its Danish and English language data, fonts and all scripts are packaged inside the extension. The content security policy is "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'". 'wasm-unsafe-eval' is needed to run the WebAssembly detection model and OCR engine that are packaged in the extension.
```

## Privacy Practices Disclosures

For the Developer Dashboard "Privacy practices" tab. The extension handles this data on the device only and transmits none of it, so the answer to "collect" is no for each type.

- Personally identifiable information: **Not collected.** Detected locally, never transmitted by the extension.
- Health information: **Not collected.**
- Financial and payment information: **Not collected.** Bank and card numbers may be detected locally, never transmitted.
- Authentication information: **Not collected.** Passwords and keys are flagged locally only.
- Personal communications: **Not collected.** Text and files are processed on the device only.
- Location: **Not collected.**
- Web history: **Not collected.** The popup reads the current tab's address only when opened, and does not store it unless the user adds the site.
- User activity: **Not collected.**
- Website content: **Not collected.** Read only for the local check.

Certify all three statements:

- I do not sell or transfer user data to third parties outside of the approved use cases.
- I do not use or transfer user data for purposes unrelated to the item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Trader status (Chrome, EU): a free, non-commercial extension may be declared as non-trader, which keeps the address off the listing. Check the current rule in the dashboard; this document is not legal advice.

## Support And Privacy Links

| Field | URL |
|---|---|
| Homepage URL | `https://ermias.ai/promptskjold` |
| Support URL | `https://github.com/segiITU/PromptSkjold/issues`, or `mailto:kontakt@ermias.ai` (update when the clean repo exists) |
| Privacy policy URL | `https://ermias.ai/promptskjold/privacy` |
| Terms | `https://ermias.ai/promptskjold/terms` |
| Source code | the public PromptSkjold repo (not yet created) |
| Contact / security | `kontakt@ermias.ai` |

## Screenshots And Promo Tiles

Use the synthetic prompts and the capture workflow in `docs/release/screenshot-script.md`, `docs/release/synthetic-prompts.md` and `docs/release/screenshot-shot-list.md`. Do not show real accounts, prompts, replies, personal data, browser profile names or local paths.

Required: at least one, ideally three to five, 1280×800 screenshots. Optional: 440×280 small promo tile and 1400×560 marquee.

Suggested frames: the review dialog on a Danish message with a CPR number and a name; the replaced message in the chat; a scanned document with black boxes; the options page with "Dine egne sider"; the welcome guide.

| Store slot | Asset | Notes |
|---|---|---|
| 128×128 icon | `src/assets/icons/icon128.png` | shield only |
| Promo tiles | `src/assets/lockup.png` on a light background | the wordmark is not final; replace when it is |

Do not use DFKI logos in any store asset: the DFKI name and logo are not licensed for this fork.

## Pre-Submission Checklist

- [ ] `manifest.json` version is `0.5.0` and the upload is the zip made by `npm run package:release` from a clean tree.
- [ ] The three pages on ermias.ai (privacy, terms, impressum) are online and the privacy URL opens without a login.
- [ ] Every claim above was checked against your live test (typed text, file attach, Copilot).
- [ ] Permission justifications match `manifest.json` (`storage`, `offscreen`, `scripting`, `activeTab`, six host sites, optional `https://*/*`).
- [ ] Screenshots are synthetic only.
- [ ] Trader or non-trader status declared.
- [ ] Contact e-mail `kontakt@ermias.ai` is verified in the dashboard.
- [ ] After the clean repo exists: update `project-links.ts`, the support URL here and the README links.
