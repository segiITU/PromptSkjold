const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function npmInvocation(args) {
  // npm.cmd cannot be spawned directly on Windows. Run npm's JavaScript CLI
  // with Node instead, preserving argument boundaries without a shell.
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  const cli = candidates.find((candidate) => candidate && /\.(?:c?js|mjs)$/i.test(candidate) && fs.existsSync(candidate));
  if (cli) return { command: process.execPath, args: [cli, ...args] };
  if (process.platform !== 'win32') return { command: 'npm', args };
  throw new Error('Cannot locate npm-cli.js. Run this script through npm run with a Node.js/npm installation.');
}

function runNpm(label, args, options = {}) {
  console.log(`\n> ${label}`);
  const invocation = npmInvocation(args);
  const result = childProcess.spawnSync(invocation.command, invocation.args, {
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...(options.env || {}) },
    stdio: 'inherit',
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with ${result.signal ? `signal ${result.signal}` : `exit code ${result.status}`}.`);
  }
}

module.exports = { npmInvocation, runNpm };
