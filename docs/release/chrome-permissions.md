# Chrome Permissions

Use this permission audit before public beta packaging and when preparing store permission justifications (the ready-to-paste texts are in `docs/release/chrome-web-store-listing.md`).

## Static Check

Run:

```bash
npm run check:permissions
```

The check compares the manifest with the allowed permission and host lists and fails on anything unsupported or on web-accessible resources.

## Manifest Permissions

| Permission | Why |
|---|---|
| `storage` | Settings, local identity vault, allow/block lists, user-added sites, short local correction log. |
| `offscreen` | Runs the local WASM/ONNX model and the OCR engine in an offscreen document, because a Manifest V3 service worker cannot host that work. |
| `scripting` | Registers the page scripts for a chat site the user adds under "Dine egne sider", after the browser's permission prompt for that one site. |
| `activeTab` | Reads the address (not the content) of the current tab when the popup is opened, to offer "Tilføj denne side". |
| `tabs` | Not requested. It would add the "Read your browsing history" install warning; host permissions already expose `tab.url` on the built-in sites. |

## Host Permissions

Built-in sites (host permissions and content-script matches must be identical):

- `https://chat.openai.com/*`
- `https://chatgpt.com/*`
- `https://claude.ai/*`
- `https://gemini.google.com/*`
- `https://copilot.microsoft.com/*`
- `https://copilot.com/*`

Optional host permission: `https://*/*`. It is not granted at install. It is requested for one site at a time when the user adds a site, and handed back when the user removes it. No `<all_urls>` and no automatic detection of unknown chat sites.

## Content Security Policy

`script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`. `wasm-unsafe-eval` is required for the packaged WebAssembly model and OCR engine. No remote code is loaded; `eval` was removed from the shipped bundle. A few library feature checks use `new Function("return this")` inside try/catch (pdf.js, emscripten, tesseract); the CSP blocks them.

## Web-Accessible Resources

None. The WASM recognizers, NER model and ONNX Runtime Web assets are loaded only by the offscreen document on the extension's own origin. Exposing them to the chat sites would let those sites detect that the extension is installed.
