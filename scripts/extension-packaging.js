const fs = require('fs');
const path = require('path');

const PREPARED_MODEL_SOURCE_DIR = path.join('generated', 'models', 'ner', 'ai4privacy');
const PREPARED_BARDSAI_MODEL_SOURCE_DIR = path.join(
  'generated',
  'models',
  'ner',
  'bardsai-eu-pii-anonimization-multilang'
);
const PACKAGED_MODEL_DIR = 'models/ner/ai4privacy';
const PACKAGED_BARDSAI_MODEL_DIR = 'models/ner/bardsai-eu-pii-anonimization-multilang';
const PACKAGED_ONNX_RUNTIME_DIR = 'vendor/onnxruntime-web';
const PREPARED_MINI_MODEL_SOURCE_DIR = path.join('generated', 'models', 'ner', 'bardsai-mini-da-en');
const PACKAGED_MINI_MODEL_DIR = 'models/ner/bardsai-mini-da-en';
const ACTIVE_PREPARED_MODEL_SOURCE_DIR = PREPARED_MINI_MODEL_SOURCE_DIR;
const ACTIVE_PACKAGED_MODEL_DIR = PACKAGED_MINI_MODEL_DIR;

const REQUIRED_MODEL_ASSETS = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  path.join('onnx', 'model_quantized.onnx'),
];

// Conversion inputs/intermediates and inactive artifacts that may sit next to
// the prepared model assets but must never ship in the extension.
const EXCLUDED_MODEL_ASSET_GLOBS = [
  '**/model_fp16.q4f16-intermediate.onnx',
  '**/model_fp16.onnx',
  '**/model_fp16.onnx.data',
  '**/*conversion-manifest.json',
  '**/model_fp16-external-data-manifest.json',
  '**/manifest.json',
];

const ONNX_RUNTIME_ASSETS = [
  // CPU/WASM path: ner-provider.ts pins wasmPaths to these when the
  // selected device is 'wasm'. The non-asyncify build has the known-good
  // CPU behavior; the asyncify build was producing degraded logits on some
  // Chrome+CPU combos.
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
];

// WebGPU path: ort.webgpu.bundle.min.mjs (bundled inside transformers.js
// v4) only references the asyncify wasm pair, which is the build that
// exports `webgpuInit`. The shipped model runs on the CPU by design, so these
// 22 MB are left out of the package unless a build asks for them
// (PG_WEBGPU_RUNTIME=1), for example to evaluate a larger WebGPU model.
const ONNX_RUNTIME_WEBGPU_ASSETS = [
  'ort-wasm-simd-threaded.asyncify.mjs',
  'ort-wasm-simd-threaded.asyncify.wasm',
];

function includeWebGpuRuntime(env = process.env) {
  return env.PG_WEBGPU_RUNTIME === '1';
}

function onnxRuntimeAssets(env = process.env) {
  return includeWebGpuRuntime(env) ? [...ONNX_RUNTIME_ASSETS, ...ONNX_RUNTIME_WEBGPU_ASSETS] : ONNX_RUNTIME_ASSETS;
}

function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

function resolveFromRoot(rootDir, relativePath) {
  return path.resolve(rootDir, relativePath);
}

function missingPreparedModelAssets(rootDir = process.cwd()) {
  const sourceRoot = resolveFromRoot(rootDir, ACTIVE_PREPARED_MODEL_SOURCE_DIR);
  return REQUIRED_MODEL_ASSETS.filter((relativePath) => {
    const candidate = path.join(sourceRoot, relativePath);
    return !fs.existsSync(candidate) || !fs.statSync(candidate).isFile();
  }).map(toPosixPath);
}

function missingOnnxRuntimeAssets(rootDir = process.cwd()) {
  const runtimeRoot = resolveFromRoot(rootDir, path.join('node_modules', 'onnxruntime-web', 'dist'));
  return onnxRuntimeAssets().filter((fileName) => {
    const candidate = path.join(runtimeRoot, fileName);
    return !fs.existsSync(candidate) || !fs.statSync(candidate).isFile();
  });
}

function modelAssetStatusMessage(missingAssets) {
  return [
    'Prepared transformer NER model assets are missing, so the extension build will package regex/fixture NER support only.',
    `Missing from ${ACTIVE_PREPARED_MODEL_SOURCE_DIR}: ${missingAssets.join(', ')}.`,
    'Place the model files in that directory (see FORK_NOTES.md) before building to package the local model.',
  ].join(' ');
}

function getNerAssetCopyPatterns(rootDir = process.cwd(), env = process.env) {
  return [
    {
      from: resolveFromRoot(rootDir, ACTIVE_PREPARED_MODEL_SOURCE_DIR),
      to: ACTIVE_PACKAGED_MODEL_DIR,
      noErrorOnMissing: true,
      globOptions: { ignore: EXCLUDED_MODEL_ASSET_GLOBS },
    },
    ...onnxRuntimeAssets(env).map((fileName) => ({
      from: resolveFromRoot(rootDir, path.join('node_modules', 'onnxruntime-web', 'dist', fileName)),
      to: `${PACKAGED_ONNX_RUNTIME_DIR}/[name][ext]`,
    })),
  ];
}

class LocalNerAssetsPlugin {
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.requirePreparedModel = Boolean(options.requirePreparedModel);
  }

  apply(compiler) {
    const checkAssets = () => {
      const missingRuntimeAssets = missingOnnxRuntimeAssets(this.rootDir);
      if (missingRuntimeAssets.length > 0) {
        throw new Error(
          `Missing ONNX Runtime Web assets in node_modules/onnxruntime-web/dist: ${missingRuntimeAssets.join(', ')}. Run npm install before building.`
        );
      }

      const missingModelAssets = missingPreparedModelAssets(this.rootDir);
      if (missingModelAssets.length === 0) return;

      const message = modelAssetStatusMessage(missingModelAssets);
      if (this.requirePreparedModel) {
        throw new Error(message);
      }

      const logger = compiler.getInfrastructureLogger
        ? compiler.getInfrastructureLogger('LocalNerAssetsPlugin')
        : null;
      if (logger && typeof logger.warn === 'function') {
        logger.warn(message);
      } else {
        console.warn(message);
      }
    };

    compiler.hooks.beforeRun.tap('LocalNerAssetsPlugin', checkAssets);
    compiler.hooks.watchRun.tap('LocalNerAssetsPlugin', checkAssets);
  }
}

module.exports = {
  ACTIVE_PACKAGED_MODEL_DIR,
  ACTIVE_PREPARED_MODEL_SOURCE_DIR,
  EXCLUDED_MODEL_ASSET_GLOBS,
  LocalNerAssetsPlugin,
  ONNX_RUNTIME_ASSETS,
  ONNX_RUNTIME_WEBGPU_ASSETS,
  onnxRuntimeAssets,
  PACKAGED_BARDSAI_MODEL_DIR,
  PACKAGED_MODEL_DIR,
  PACKAGED_ONNX_RUNTIME_DIR,
  PREPARED_BARDSAI_MODEL_SOURCE_DIR,
  PREPARED_MODEL_SOURCE_DIR,
  REQUIRED_MODEL_ASSETS,
  getNerAssetCopyPatterns,
  missingOnnxRuntimeAssets,
  missingPreparedModelAssets,
  modelAssetStatusMessage,
};
