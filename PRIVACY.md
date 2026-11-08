# Privacy Policy

This privacy policy describes how the **PromptSkjold** browser extension processes
personal data, in accordance with Articles 13 and 14 of the EU General Data Protection
Regulation (GDPR).

PromptSkjold is a public-beta browser extension that helps you **detect, review, mark,
replace, and later restore** personal data in text *before* you paste it into supported
large-language-model (LLM) chat applications. It runs **locally in your browser**. It is an
**assistive tool only and does not guarantee** that all sensitive content will be detected,
marked, or removed. You remain responsible for reviewing text before you send it.

The extension does **not** anonymize data in a legal sense. It assists you in identifying and
substituting personal data; the result may still allow re-identification.

## 1. Controller (Verantwortlicher)

The controller responsible for the extension within the meaning of Art. 4(7) GDPR is:

Sebastian Gilson (ermias.ai)
Website: https://ermias.ai
Contact: GitHub Issues at https://github.com/segiITU/PromptSkjold/issues (for anything that must
not be public, see §15)
Email: kontakt@ermias.ai
CVR: 38843443

PromptSkjold is a fork of the open-source *Privacy Guardrail* extension by the German Research
Center for Artificial Intelligence (DFKI), used under the Apache License 2.0. DFKI is not the
controller of PromptSkjold and does not operate, review or endorse it. See [NOTICE](NOTICE) and
[FORK_NOTES.md](FORK_NOTES.md) for what comes from upstream and what was changed.

See the [Impressum](IMPRESSUM.md) for the full legal notice.

## 2. Data Protection Officer

No data protection officer has been appointed. Direct questions about data protection to the
controller in §1.

## 3. Purposes of Processing

The extension processes data on your device for the following purposes:

- **Local detection** of personal data in text you paste or enter on supported sites (the built-in
  sites in §7 and any sites you add yourself, see §7a).
- **Review and marking** of detected items so you can decide what to keep, replace, or ignore.
- **Replacement** of selected items with placeholders or synthetic substitutes.
- **Restoration** of original values in responses, where you have chosen to do so.
- **Storing your settings** and the **placeholder/value mappings** needed to perform the
  replacement and restoration you requested.
- **Local review of attached files** (on by default, you can switch it off, see §6a): reading
  images, PDFs, Word files and plain-text files you attach on a supported
  site (Excel and PowerPoint files too, if you switch on "Tjek Excel- og PowerPoint-filer", which is off by default), locally, so that personal data in them can be found and replaced or blacked out before
  the file is attached.
- **Remembering the sites you added** and whether setting each one up worked (see §7a).
- **A short welcome guide** shown once, in a tab, after a fresh install. It stores only that it was
  shown (`pg_onboarding`).

## 4. Legal Basis

- **Art. 6(1)(b) GDPR** (performance of a function you request): the extension processes the
  text you provide in order to carry out the detection, replacement, and restoration that you
  explicitly initiate.
- **Art. 6(1)(f) GDPR** (legitimate interests), where relevant: enabling you to reduce the
  amount of personal data you disclose to third-party AI services, and operating a functional,
  secure research prototype. All processing remains local to your device.

Because all processing happens locally on your end device and the controller does not receive any
of the processed content, the controller does not act as a controller over the substance of the
text you process.

## 5. Recipients & Non-Transmission

The controller does **not** receive, store, or evaluate user content from the extension. In particular,
the extension does **not** transmit user content, prompts, responses, detection results,
placeholder mappings, identity-vault data, local feedback records/logs, or model input to the
controller or to any project-operated server. There is no telemetry back-channel.

Voluntary reports you submit outside the extension, for example through GitHub Issues or by
email to the controller, are separate from extension operation and contain only what you choose
to send.

PromptSkjold does **not** include:

- telemetry
- analytics
- automatic remote feedback collection
- automatic crash report upload
- upload of clipboard content
- upload of prompts or responses
- upload of detected entities
- upload of identity maps or vault data
- upload of local feedback logs
- upload of model input

Detection runs in the browser using local deterministic recognizers and, where available, a
local AI/NER model packaged with the extension. Pasted text is **not** sent to any remote
inference service by the extension.

## 6. Clipboard Access

Because the extension works on text you copy and paste, this section describes precisely when
and how it accesses clipboard content.

**No clipboard permissions.** The extension's manifest requests neither the `clipboardRead` nor
the `clipboardWrite` browser permission. Those permissions are what would allow an extension to
read the clipboard's contents on demand. Without them, the extension only ever sees clipboard
text that the browser itself hands to the page during a copy or paste you perform, and only
writes to the clipboard when you click one of its buttons (see below). It cannot read your
clipboard in the background, on a schedule, or while you are on any other website.

**Where it runs.** The extension's page scripts are injected **only** on the built-in chat sites
listed in §7 (`chatgpt.com`, `chat.openai.com`, `claude.ai`, `gemini.google.com`, `copilot.microsoft.com`, `copilot.com`) and on the sites
you have added yourself (§7a). On every other website, no extension code runs at all and no
clipboard content is accessible to it.

**When clipboard text is read.** On the supported sites only, and only as part of an action you
perform yourself:

- **When you paste.** If you paste into the chat input field of a supported site, the extension
  reads the pasted text from the paste event itself (`ClipboardEvent.clipboardData`), which the
  browser hands to the page for that single event. Pastes into other fields on the page are
  ignored, as is pasted text shorter than 10 characters. The text is then processed locally for
  detection and presented to you for review.
- **When you copy.** If the **Intercept copy** setting is enabled, then when you copy text on a
  supported site the extension inspects the copied text for placeholders it inserted earlier, so
  that it can offer to restore the original values. It takes that text from the copy event or
  from the current page selection. To catch copies triggered by the website's own buttons, a
  small script on those sites also observes clipboard writes that the site itself makes and
  reports them to the extension. That script is part of the page scripts injected on those sites
  and is always present there; when interception is off, the extension discards what it reports
  without inspecting the text.

The extension does not poll or monitor the clipboard between these events. What it keeps
afterwards is limited to the local storage described in §9: the placeholder ↔ original-value
mappings needed for restoration, and, if you correct a detection while reviewing, that item's
text together with up to 20 characters of the surrounding text on either side, kept in the local
feedback log. Both stay on your device.

**When clipboard text is written.** The extension writes to the clipboard only when you click a
button it has put on the page, and only with text in which placeholders have been restored to
their original values. There are two such buttons: **Replace with originals** in the notification
shown after you copy, and **Copy** in the banner above a response that contains restored values.
If you do not click either, nothing is written. These writes require no clipboard permission
because they happen in the page in direct response to your click, in the same way a website's own
copy button works.

**How to switch it off.** The copy-side behavior is controlled by the **Intercept copy** setting.
Reviewing what you paste is controlled by the master protection toggle. With master protection
switched off, the extension no longer reviews what you paste, no longer inspects what you copy,
and stores nothing further. The page-world observer described above remains installed on the
supported sites, because it is part of the page scripts injected there, but nothing in the
extension acts on what it reports. What it reports travels only as a message within the page you
are already on; the text is not inspected, not stored, and never leaves your browser.

In every case, clipboard content is processed **locally in your browser**. As stated in §5, it is
never transmitted to the controller.

## 6a. Attached Files and Image Checking

File review is **on by default** and can be switched off in the popup or the options page
("Tjek billeder og scannede PDF'er"). While it is on, the extension does the following, on
supported chat sites only:

- **Intercepts file attachments.** When you choose, drop or paste a file, the extension holds it
  back, reads it locally, shows the result and then attaches either the original or a changed
  copy, as you decide. It reads the file you attached; it does not read other files on your
  device. Files of a type it does not read are passed on unchanged.
- **Reads files locally.** Text recognition (OCR) of images and scanned PDF pages, reading of PDF
  text, Word (`.docx`), Excel (`.xlsx`) and PowerPoint (`.pptx`) files (only when that switch is on) and plain-text files, and the making of replaced or blacked-out copies all
  happen in your browser. The file, the text read from it and the changed copy are not sent to
  the controller, the project, or any server by the extension. For PDFs, text in form fields and
  comments is read along with the page text. For Word, Excel and PowerPoint, the author, company, comments and
  deleted text are checked too, even though a changed copy leaves them out. The file name (without its extension)
  is checked the same way, and a name with personal data is replaced in the copy that is attached. A changed Word, Excel or PowerPoint copy
  leaves out the file's properties (author, last modified by, company) and its comments; charts,
  embedded images and files and custom XML are not read and stay as they were (the review says so).
- **Downloads nothing.** The Danish and English Tesseract language files (about 6.4 MB) ship inside
  the extension package, so turning the feature on makes no request to any server and needs no
  extra browser permission. A copy downloaded by an earlier version is deleted when the extension
  updates.
- **Keeps nothing from the file** beyond what you already choose to keep: replacements made in a
  file are recorded in the identity vault (§9) in the same way as replacements in pasted text.

Whatever you attach and send is then processed by the AI service under its own terms (§7). The
extension cannot check attachments added in ways it does not see, or file types it does not read.

## 7. AI Services (ChatGPT, Claude, Gemini, Copilot)

The extension supports use alongside third-party AI chat services, currently:

- ChatGPT (`chatgpt.com`, `chat.openai.com`)
- Claude (`claude.ai`)
- Gemini (`gemini.google.com`)
- Microsoft Copilot (`copilot.microsoft.com`, `copilot.com`)

Transmission of text to one of these providers happens **only when you yourself send** the
reviewed text in that service's chat interface. At that point the text leaves your browser and
is processed by the respective provider under **its own privacy terms and as its own
controller**. The extension does not send anything to these providers on your behalf; it only
helps you review text beforehand. Please consult each provider's privacy policy for how it
processes the data you submit.

## 7a. Sites You Add Yourself

You can add other chat sites (for example `chat.dk`) in the options page ("Dine egne sider") or
with the "Tilføj denne side" button in the toolbar popup. This is the only way the extension
ever runs on a site that is not listed in §7, and it never happens by itself.

- **You choose each site, and the browser asks you.** The extension asks Chrome (or Edge) for
  access to that one site, `https` only, including its subdomains, and the browser shows its own
  permission prompt. The extension holds no access to other sites. It does not look at pages to
  guess whether they are chat sites, and it does not keep or read your browsing history.
- **What then runs on that site.** The same page scripts as on the built-in sites: checking what
  you paste, type and send, and the files you attach, locally. Only the built-in sites are tested
  by the project; on added sites the extension uses a generic adaptation that may work less well,
  so it can miss text or files there.
- **Suggestions.** The options page and the welcome guide list a few well-known chat sites as
  one-click suggestions. A suggestion changes nothing until you press "Tilføj" and allow it in
  the browser's prompt; the list is fixed text inside the extension and is not fetched from anywhere.
- **The toolbar button.** When you open the popup, the extension reads the address (not the
  content) of the tab you opened it on, using the browser's `activeTab` permission, to offer to
  add that site. The address is used in the popup and is not stored unless you add the site.
- **What is stored.** The host names you added and whether setting each one up succeeded (§9).
  Nothing about the pages themselves, and nothing is sent anywhere.
- **Removing a site.** "Fjern" in the options page unregisters the page scripts for that site and
  gives the browser permission back. Removing the extension removes everything it stored.
- **Permissions in the manifest.** `scripting` (to register the page scripts for a site you
  added), `activeTab` (the toolbar button above) and an *optional* access to `https` sites that
  is granted one site at a time and is not active at installation.

## 8. Third-Country Transfers

The extension itself causes **no** transfer of personal data to third countries; nothing is
transmitted off your device by the extension. However, if you choose to submit text to an AI
service (see §7), that provider may process your submission in a third country under its own
terms. Any such transfer is governed by the provider, not by the controller or this extension.

## 9. Local Storage, Retention, and Deletion

The extension stores state in your browser's local extension storage (`chrome.storage.local`),
on your end device only. The following keys may be stored, each only as needed for the function
you use:

| Storage key | Contents | Why it is necessary |
| --- | --- | --- |
| `pg_settings` | Your preferences (categories, sensitivity, replacement mode, language of replacements, whether file review is on, theme, Local AI options, allow/block lists) | To apply your chosen configuration |
| `pg_conversation_records` | The replacement placeholders used in a conversation, keyed by conversation URL. Placeholders only — no original values | To know which replacements may be restored on a given page |
| `pg_entity_maps` | Placeholder ↔ original-value mappings, keyed by conversation URL, written by versions up to 0.4.2 only. Kept so conversations from before the change still restore; never added to | To restore original values you replaced before this key was retired |
| `pg_identity_vault` | Identity vault entries (stable replacements for recurring identities), including the original values | To produce consistent replacements across pastes, and to restore originals |
| `pg_feedback` | Local correction/feedback records: the detected and corrected category and a timestamp, nothing of your text. Records are deleted after 30 days and the log is capped at the last 1000 entries. Versions before this one also kept the corrected item's text and a short excerpt around it; they are no longer stored and are removed from existing records | To improve your local experience; never uploaded |
| `pg_system_check` | Result of the local system/compatibility check | To show whether Local AI can run on your device |
| `pg_user_sites` | The host names of sites you added (for example `chat.dk`) and when you added them | To run the extension on those sites (§7a) |
| `pk_ui_language` | Your language choice for the interface (`auto`, `da` or `en`) | To show PromptSkjold in the language you chose |
| `pg_onboarding` | Whether the welcome guide has been shown, and when | To show the guide once, after a fresh install |
| `pg_user_site_status` | For each added site: waiting, active, or failed (and the browser's error text if it failed) | To show you whether the site is protected |

In addition, while file review is on, the OCR engine keeps the packaged language files in the
browser's IndexedDB for the text-recognition library (not in `chrome.storage.local`). They ship with
the extension and contain no personal data.

**Where it is stored:** locally in your browser profile, on your device. It is **not** collected
by the controller.

**Not encrypted:** `chrome.storage.local` is a plain file store inside your browser profile. The
identity vault (the original values next to their replacements) is stored **unencrypted**. Other websites and other extensions cannot read them, but anyone
or anything with access to your user account or a copy of the profile (malware, a shared computer,
a backup, a forensic image) can. A key kept in the same profile would not change that, so the
extension does not pretend to encrypt. If this matters for you, switch off "Husk på tværs af
samtaler" (cross-session memory, off by default for new installs), clear the vault when you are done,
and use disk encryption and a separate browser profile.

**With cross-session memory switched off:** no original values are written to local extension
storage at all. The placeholder ↔ original-value pairs needed to restore what you replaced are
held in `chrome.storage.session` instead, under `pg_conversation_records`. That area is cleared
by the browser when the browser session ends, so restoration survives a page reload and moving
between conversations, and nothing outlives the session.

**Local-storage necessity (§ 25 TDDDG):** the extension uses `chrome.storage.local` only to
provide functions you explicitly request, including applying your settings, keeping
records of which placeholders a conversation used, maintaining stable local replacement
identities and the original values they stand for,
storing local correction records, and showing the local system-compatibility result. This local
storage is necessary for those requested extension functions. It is not used for tracking,
analytics, telemetry, advertising, or remote profiling.

**Retention:** data remains until **you** delete it. There is no automatic upload and no
server-side copy. The feedback log is the exception: records older than 30 days are deleted
automatically, and it is capped at the most recent 1000 entries.

**Debug log (off by default).** The setting "debug" is off for new installs. When you switch it on, the extension writes diagnostic lines to the browser console of the chat page and of the extension's own pages: timings, character and item counts, model and device names, and the settings in use (which can include entries you typed into the allow and block lists). It is not written to storage and not sent anywhere, but anyone who can see your console (a screen share, a pasted bug report) can read it. The log lines are not meant to contain the text you paste; switch debug off before you share a console log. Installs that saved a value for it in an earlier version keep that value.

**How to delete it:**

- Clear placeholder mappings per conversation or for all conversations from the extension UI.
- Clear identity vault entries from the Vault card in the options page.
- Clear the local feedback log from the options page.
- Reset settings from the options page.

**On uninstall or browser-profile deletion:** Chrome removes the extension's
`chrome.storage.local` data, so all of the above is deleted by the browser.

## 10. Special Categories of Data (Art. 9 GDPR)

Depending on the text you choose to process, the extension may touch **special categories of
personal data** (Art. 9 GDPR) — for example data revealing health, religion, or similar. Any
such data is **processed locally on your device only** and is **not transmitted to the controller**. You
decide what text to process and what to send onward to an AI service.

## 11. Automated Decision-Making / Profiling

The extension does **not** carry out automated decision-making that produces legal effects or
similarly significantly affects you within the meaning of Art. 22 GDPR. Detection is **assistive
scoring** that surfaces suggestions for your review; it does not make decisions about a data
subject. The extension does not create profiles of users.

## 12. Your Rights

Under the GDPR you have the right to:

- **access** your personal data (Art. 15),
- **rectification** of inaccurate data (Art. 16),
- **erasure** (Art. 17),
- **restriction** of processing (Art. 18),
- **object** to processing (Art. 21),
- **data portability** (Art. 20).

Because data processed by the extension stays on your device and the controller holds none of it, you can
exercise most of these rights directly by viewing, editing, or deleting your local data (see §9).
For any request to the controller, contact the addresses in §1 and §2.

You also have the right to **lodge a complaint with a supervisory authority** (Art. 77 GDPR), in
particular in the EU member state of your residence, workplace, or the place of the alleged
infringement.

## 13. Diagnostics & Training

User content and local feedback logs are **not used for training** by this project. The local
feedback log (§9) stays on your device and is never uploaded.

The only exception is when **you deliberately create and submit a sanitized sample outside the
extension** (for example, attaching a synthetic example to a report). That is your own,
deliberate action.

Any future diagnostic feature will be **described and assessed separately before it is
introduced**. This policy does not pre-authorize any future diagnostic data flow.

## 14. Public Support / GitHub Issues

Public support is handled via **GitHub Issues, which are public**. Anything you post there is
visible to anyone.

**Do not post** real personal data, confidential documents, real prompts or responses,
screenshots containing real data, secrets, or other sensitive content in GitHub Issues. Keep all
examples **synthetic or sanitized**.

## 15. Confidential Reporting

For sensitive security or privacy reports, write to kontakt@ermias.ai (the contact in §1). You can also use GitHub's private vulnerability reporting on the repository (Security tab, "Report a vulnerability"). Do not use public
GitHub Issues for sensitive reports. See [SECURITY.md](SECURITY.md) for what to include.

## 16. Limits of Detection

PromptSkjold is **assistive only**. It does **not guarantee** complete detection, marking,
or removal of personal or sensitive data, and it is **not a compliance product**. Detection can
miss content or mis-flag content. Always review text yourself before sending it to any AI service.

## 17. Impressum

For the full legal notice (provider identification under § 5 DDG), see the
[Impressum](IMPRESSUM.md).
