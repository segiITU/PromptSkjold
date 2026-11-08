# Building PromptSkjold

This guide covers local development builds for PromptSkjold, the public beta Chrome extension source published at `git@github.com:segiITU/PromptSkjold.git`.

## Prerequisites

Install:

- Node.js 20 or newer, with npm.
- Google Chrome desktop stable.
- Rust via `rustup`.
- Rust target `wasm32-unknown-unknown`.
- `wasm-bindgen-cli` version `0.2.118`.
- Python 3.10+ when preparing local NER model assets.

Initial setup:

```bash
rustup update
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.118
npm install
```

If Cargo rejects the lockfile version, update Rust with `rustup update`.

## Rebuild From PowerShell On Windows

For a frontend-only rebuild when `crate/pkg/` already matches the Rust source:

```powershell
npm run build:ext
```

For a full rebuild, use `npm run build`. Native Windows builds require the MSVC C++ build tools and `wasm-bindgen` on PATH. If those are unavailable, use the existing WSL Linux Rust toolchain instead:

```powershell
# One-time setup in the default WSL distribution (Rust/cargo must already be installed there).
wsl --exec bash -lc 'rustup target add wasm32-unknown-unknown'
wsl --cd $PWD.Path --exec bash -lc 'cargo install wasm-bindgen-cli --version 0.2.118 --locked --root ./tmp/wasm-tools'

# Use WSL for Rust only; Node/npm and webpack still run on Windows.
$env:PROMPTSKJOLD_USE_WSL = '1'
npm run build
npm run validate:release-strict
npm run test:e2e:harness

# After reviewing and committing the source changes (requires a clean Git tree):
npm run package:release
```

WSL must be installed with a default distribution. Its Rust dependencies need network access on the first build. The workspace-local CLI is stored under ignored `tmp/wasm-tools/`. Keep the environment variable set in the PowerShell session for validation and packaging too. To return to native Rust, run `Remove-Item Env:PROMPTSKJOLD_USE_WSL`.

The extension is rebuilt in `dist/`. The upload package and checksum are written to `release/prompt-skjold-<version>.zip` and `.sha256`. Generated artifacts stay out of Git. Reload the extension in `chrome://extensions` or `edge://extensions`, then refresh the chat tab.

## Model-Free Build

A normal build can run without prepared transformer model assets:

```bash
npm run build
```

This runs:

- `npm run build:wasm`
- `npm run build:ext`

The output is written to `dist/`. Without prepared BardsAI assets, the extension packages deterministic pattern detection and fixture-backed flows only; Local AI transformer detection is unavailable at runtime.

For frontend-only iteration after WASM has already been built:

```bash
npm run build:ext
```

For watch mode:

```bash
npm run build:wasm
npm run dev
```

When Rust code under `crate/src/` changes, rerun `npm run build:wasm`, reload the unpacked extension, and refresh the supported chat tab.

## Full Model Build

The public beta release package includes the Danish/English mini model. Fetch the pinned model weights and stage the committed tokenizer/config files:

```bash
npm run fetch:model
```

Then build with missing model assets treated as fatal:

```bash
NER_MODEL_ASSETS_REQUIRED=1 npm run build
```

In PowerShell, set `$env:NER_MODEL_ASSETS_REQUIRED = '1'` before `npm run build`. `npm run validate:release-strict` and `npm run package:release` enforce model presence themselves.

Expected prepared asset location:

```text
generated/models/ner/bardsai-mini-da-en/
  config.json
  tokenizer.json
  tokenizer_config.json
  onnx/model_quantized.onnx
```

Webpack copies those files into `dist/models/ner/bardsai-mini-da-en/` and copies the CPU/WASM ONNX Runtime Web files into `dist/vendor/onnxruntime-web/`.

See `docs/developer/model-assets.md` for source download, conversion, and licensing notes.

## Checks And Tests

Run the model-free checks before opening a pull request:

```bash
npm run validate:ci
```

This command does not download, prepare, or require large model assets. It runs the same model-free validation used by GitHub Actions: Jest, Svelte checks, version alignment, Chrome permission checks, the privacy-boundary scan, Rust tests, and a model-free extension build.

Optional checks:

```bash
npm run benchmark:openpii -- --regex-only
```

Opt-in local model regression tests require local-only AI4Privacy assets and fixtures:

```bash
npm run test:ner:model
```

Those local model fixtures are not part of the public initial commit.

## Load In Chrome

1. Build the extension.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Choose Load unpacked.
5. Select this repository's `dist/` directory.
6. Open or refresh a supported beta site:
   - `chatgpt.com`
   - `chat.openai.com`
   - `claude.ai`
   - `gemini.google.com`

The Chrome Web Store is the primary install path for beta users. Loading unpacked builds is for development and manual release validation.

## Common Build Problems

- Missing `wasm-bindgen`: install `wasm-bindgen-cli` version `0.2.118`.
- Missing ONNX Runtime Web files: run `npm install`.
- Missing BardsAI assets in strict mode: prepare the model assets, then rerun `NER_MODEL_ASSETS_REQUIRED=1 npm run build`.
- Release-strict validation fails on missing BardsAI assets by design; use `npm run validate:ci` for model-free pull request checks.
- Python conversion import errors: activate `.venv` and install `onnx`, `onnxruntime`, and `sympy`.
