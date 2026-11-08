#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { runNpm } = require('./run-npm');

const DEFAULT_VERSION = null;

function readPackageVersion(rootDir = process.cwd()) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  return packageJson.version;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {
    command,
    version: DEFAULT_VERSION,
  };

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--version') {
      const value = rest[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--version requires a value.');
      }
      options.version = value;
      i += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function runCiValidation(options = {}) {
  const version = options.version || readPackageVersion();
  runNpm('WASM build', ['run', 'build:wasm']);
  runNpm('Unit tests', ['test']);
  runNpm('Svelte and TypeScript component checks', ['run', 'check:svelte']);
  runNpm('Version alignment', ['run', 'version:check', '--', version]);
  runNpm('Chrome permission audit', ['run', 'check:permissions']);
  runNpm('Privacy boundary check', ['run', 'check:privacy-boundary']);
  runNpm('Rust tests', ['run', 'test:rust']);
  runNpm('Model-free extension build', ['run', 'build:ext']);
}

function runReleaseStrictValidation(options = {}) {
  const version = options.version || readPackageVersion();
  runNpm('Version alignment', ['run', 'version:check', '--', version]);
  runNpm('Chrome permission audit', ['run', 'check:permissions']);
  runNpm('Privacy boundary check', ['run', 'check:privacy-boundary']);
  runNpm('Unit tests', ['test']);
  runNpm('Svelte and TypeScript component checks', ['run', 'check:svelte']);
  runNpm('Rust tests', ['run', 'test:rust']);
  runNpm('WASM release build', ['run', 'build:wasm']);
  runNpm('Extension build with required BardsAI assets', ['run', 'build:ext'], {
    env: { NER_MODEL_ASSETS_REQUIRED: '1' },
  });
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.command === 'ci') {
    runCiValidation(options);
    return;
  }

  if (options.command === 'release-strict') {
    runReleaseStrictValidation(options);
    return;
  }

  throw new Error('Usage: node scripts/validate.js <ci|release-strict> [--version x.y.z]');
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_VERSION,
  parseArgs,
  readPackageVersion,
  runCiValidation,
  runReleaseStrictValidation,
};
