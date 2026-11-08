const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function run(command, args, cwd, wslCommand) {
  const useWsl = process.platform === 'win32' && process.env.PROMPTSKJOLD_USE_WSL === '1';
  const result = useWsl
    ? childProcess.spawnSync('wsl.exe', ['--cd', cwd, '--exec', 'bash', '-lc', wslCommand], { stdio: 'inherit', shell: false })
    : childProcess.spawnSync(command, args, { cwd, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with ${result.signal || result.status}.`);
}

function main(command) {
  if (!['build', 'test'].includes(command)) throw new Error('Usage: node scripts/rust.js <build|test>');
  const crateDir = path.join(root, 'crate');
  if (command === 'test') {
    run('cargo', ['test'], crateDir, 'cargo test');
    return;
  }
  run('cargo', ['build', '--release', '--target', 'wasm32-unknown-unknown'], crateDir,
    'cargo build --release --target wasm32-unknown-unknown');
  const args = ['--target', 'web', '--out-dir', 'crate/pkg', '--out-name', 'privacy_guardrail_wasm',
    'crate/target/wasm32-unknown-unknown/release/privacy_guardrail_wasm.wasm'];
  const localCli = path.join(root, 'tmp', 'wasm-tools', 'bin', process.platform === 'win32' ? 'wasm-bindgen.exe' : 'wasm-bindgen');
  const cli = fs.existsSync(localCli) ? localCli : 'wasm-bindgen';
  // WSL may use a workspace-local installation instead of changing the user's PATH.
  run(cli, args, root,
    'if [ -x ./tmp/wasm-tools/bin/wasm-bindgen ]; then ./tmp/wasm-tools/bin/wasm-bindgen --target web --out-dir crate/pkg --out-name privacy_guardrail_wasm crate/target/wasm32-unknown-unknown/release/privacy_guardrail_wasm.wasm; else wasm-bindgen --target web --out-dir crate/pkg --out-name privacy_guardrail_wasm crate/target/wasm32-unknown-unknown/release/privacy_guardrail_wasm.wasm; fi');
}

if (require.main === module) {
  try { main(process.argv[2]); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { main };
