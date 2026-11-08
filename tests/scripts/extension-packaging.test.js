const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ACTIVE_PACKAGED_MODEL_DIR,
  ACTIVE_PREPARED_MODEL_SOURCE_DIR,
  LocalNerAssetsPlugin,
  ONNX_RUNTIME_ASSETS,
  PACKAGED_ONNX_RUNTIME_DIR,
  getNerAssetCopyPatterns,
  missingOnnxRuntimeAssets,
  missingPreparedModelAssets,
  modelAssetStatusMessage,
} = require('../../scripts/extension-packaging');

function writeFile(filePath, contents = 'fixture') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function writePreparedModel(root) {
  const modelRoot = path.join(root, ACTIVE_PREPARED_MODEL_SOURCE_DIR);
  writeFile(path.join(modelRoot, 'config.json'), '{}\n');
  writeFile(path.join(modelRoot, 'tokenizer.json'), '{}\n');
  writeFile(path.join(modelRoot, 'tokenizer_config.json'), '{}\n');
  writeFile(path.join(modelRoot, 'onnx', 'model_quantized.onnx'), 'q8');
}

function writeOnnxRuntime(root) {
  for (const asset of ONNX_RUNTIME_ASSETS) {
    writeFile(path.join(root, 'node_modules', 'onnxruntime-web', 'dist', asset));
  }
}

function createCompiler() {
  const taps = {};
  return {
    warnings: [],
    hooks: {
      beforeRun: {
        tap(name, callback) {
          taps.beforeRun = callback;
        },
      },
      watchRun: {
        tap(name, callback) {
          taps.watchRun = callback;
        },
      },
    },
    getInfrastructureLogger() {
      return {
        warn: (message) => {
          this.warnings.push(message);
        },
      };
    },
    runHook(name) {
      taps[name]();
    },
  };
}

describe('extension NER asset packaging', () => {
  let tempRoot;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-extension-packaging-'));
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  test('detects whether prepared model assets are complete', () => {
    expect(missingPreparedModelAssets(tempRoot)).toEqual([
      'config.json',
      'tokenizer.json',
      'tokenizer_config.json',
      'onnx/model_quantized.onnx',
    ]);

    writePreparedModel(tempRoot);

    expect(missingPreparedModelAssets(tempRoot)).toEqual([]);
  });

  test('returns copy patterns matching the transformer provider resource paths', () => {
    const patterns = getNerAssetCopyPatterns(tempRoot);
    const runtimeFile = (name) =>
      expect.objectContaining({
        from: path.join(tempRoot, 'node_modules', 'onnxruntime-web', 'dist', name),
        to: `${PACKAGED_ONNX_RUNTIME_DIR}/[name][ext]`,
      });

    expect(patterns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: path.join(tempRoot, ACTIVE_PREPARED_MODEL_SOURCE_DIR),
          to: ACTIVE_PACKAGED_MODEL_DIR,
          noErrorOnMissing: true,
          // The single int8 model ships; conversion intermediates and
          // fp16 artifacts must be filtered out.
          globOptions: {
            ignore: [
              '**/model_fp16.q4f16-intermediate.onnx',
              '**/model_fp16.onnx',
              '**/model_fp16.onnx.data',
              '**/*conversion-manifest.json',
              '**/model_fp16-external-data-manifest.json',
              '**/manifest.json',
            ],
          },
        }),
        runtimeFile('ort-wasm-simd-threaded.mjs'),
        runtimeFile('ort-wasm-simd-threaded.wasm'),
      ])
    );
  });

  test('leaves the 22 MB WebGPU runtime out unless the build asks for it', () => {
    const files = (env) =>
      getNerAssetCopyPatterns(tempRoot, env)
        .filter((pattern) => String(pattern.from).includes('onnxruntime-web'))
        .map((pattern) => path.basename(pattern.from));

    expect(files({})).toEqual(['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']);
    expect(files({ PG_WEBGPU_RUNTIME: '1' })).toEqual([
      'ort-wasm-simd-threaded.mjs',
      'ort-wasm-simd-threaded.wasm',
      'ort-wasm-simd-threaded.asyncify.mjs',
      'ort-wasm-simd-threaded.asyncify.wasm',
    ]);
  });

  test('exposes no packaged assets to web pages', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../manifest.json'), 'utf8')
    );

    // The offscreen document loads the WASM, model and ONNX runtime from the
    // extension origin, which needs no web-accessible entry.
    expect(manifest.web_accessible_resources).toBeUndefined();
  });

  test('injects paste guards before page scripts on every monitored chat host', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../manifest.json'), 'utf8')
    );
    const monitoredHosts = [
      'https://chat.openai.com/*',
      'https://chatgpt.com/*',
      'https://claude.ai/*',
      'https://gemini.google.com/*',
      'https://copilot.microsoft.com/*',
      'https://copilot.com/*',
    ];
    const isolatedScript = manifest.content_scripts.find((entry) =>
      entry.js.includes('content/content-script.js')
    );
    const pageScript = manifest.content_scripts.find((entry) =>
      entry.js.includes('content/clipboard-interceptor-page.js')
    );

    expect(isolatedScript).toMatchObject({
      matches: monitoredHosts,
      run_at: 'document_start',
    });
    expect(pageScript).toMatchObject({
      matches: monitoredHosts,
      run_at: 'document_start',
      world: 'MAIN',
    });
  });

  test('warns about missing prepared model assets by default', () => {
    writeOnnxRuntime(tempRoot);
    const compiler = createCompiler();
    const plugin = new LocalNerAssetsPlugin({ rootDir: tempRoot });

    plugin.apply(compiler);
    compiler.runHook('beforeRun');

    expect(compiler.warnings).toHaveLength(1);
    expect(compiler.warnings[0]).toContain('Prepared transformer NER model assets are missing');
    expect(compiler.warnings[0]).toContain('bardsai-mini-da-en');
  });

  test('fails when prepared model assets are required', () => {
    writeOnnxRuntime(tempRoot);
    const compiler = createCompiler();
    const plugin = new LocalNerAssetsPlugin({
      rootDir: tempRoot,
      requirePreparedModel: true,
    });

    plugin.apply(compiler);

    expect(() => compiler.runHook('beforeRun')).toThrow(
      /Prepared transformer NER model assets are missing/
    );
  });

  test('fails clearly when ONNX Runtime Web package assets are missing', () => {
    expect(missingOnnxRuntimeAssets(tempRoot)).toEqual(ONNX_RUNTIME_ASSETS);

    const compiler = createCompiler();
    const plugin = new LocalNerAssetsPlugin({ rootDir: tempRoot });
    plugin.apply(compiler);

    expect(() => compiler.runHook('beforeRun')).toThrow(/Missing ONNX Runtime Web assets/);
  });

  test('does not warn when model and runtime assets are present', () => {
    writePreparedModel(tempRoot);
    writeOnnxRuntime(tempRoot);
    const compiler = createCompiler();
    const plugin = new LocalNerAssetsPlugin({ rootDir: tempRoot });

    plugin.apply(compiler);
    compiler.runHook('watchRun');

    expect(compiler.warnings).toEqual([]);
    expect(modelAssetStatusMessage(['config.json'])).toContain(ACTIVE_PREPARED_MODEL_SOURCE_DIR);
  });
});
