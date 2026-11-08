const childProcess = require('node:child_process');
const path = require('node:path');
const { main } = require('../../scripts/rust');

describe('Rust build toolchain routing', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  let originalWsl;
  let spawn;

  beforeEach(() => {
    originalWsl = process.env.PROMPTSKJOLD_USE_WSL;
    delete process.env.PROMPTSKJOLD_USE_WSL;
    spawn = jest.spyOn(childProcess, 'spawnSync').mockReturnValue({ status: 0 });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', originalPlatform);
    if (originalWsl === undefined) delete process.env.PROMPTSKJOLD_USE_WSL;
    else process.env.PROMPTSKJOLD_USE_WSL = originalWsl;
    jest.restoreAllMocks();
  });

  test('builds WASM before generating the web bindings with the native toolchain', () => {
    main('build');
    expect(spawn.mock.calls[0]).toEqual(['cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown'],
      expect.objectContaining({ cwd: path.resolve(__dirname, '../../crate'), shell: false })]);
    expect(spawn.mock.calls[1][1]).toEqual(['--target', 'web', '--out-dir', 'crate/pkg', '--out-name',
      'privacy_guardrail_wasm', 'crate/target/wasm32-unknown-unknown/release/privacy_guardrail_wasm.wasm']);
  });

  test('uses the default WSL distribution only when explicitly enabled on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    process.env.PROMPTSKJOLD_USE_WSL = '1';
    main('test');
    expect(spawn).toHaveBeenCalledWith('wsl.exe', ['--cd', path.resolve(__dirname, '../../crate'),
      '--exec', 'bash', '-lc', 'cargo test'], { stdio: 'inherit', shell: false });
  });

  test('does not generate bindings after a failed compile', () => {
    spawn.mockReturnValue({ status: 1 });
    expect(() => main('build')).toThrow('cargo failed with 1');
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});
