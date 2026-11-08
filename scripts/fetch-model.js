#!/usr/bin/env node
/*
 * Fetch the default Danish/English NER model for the extension build.
 *
 * Copies the tokenizer and config files that are committed under vendor-data/model/ and downloads the
 * int8 ONNX weights (21.8 MB) from Hugging Face, verifying a pinned SHA-256 before the file is used.
 * Output: generated/models/ner/bardsai-mini-da-en/ (git-ignored; packaged by the webpack build).
 *
 * Usage: node scripts/fetch-model.js [--force]
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_URL =
  'https://huggingface.co/ermias-ai/da-pii-mini-preview-21m/resolve/main/model_int8mm_embq.onnx';
const SHA256 = '29dfc1c326b322520107c8ffc69bc38bc66b2311c2db278689588b070f4ff4be';
const SMALL_FILES_DIR = path.join(ROOT, 'vendor-data', 'model', 'bardsai-mini-da-en');
const OUT_DIR = path.join(ROOT, 'generated', 'models', 'ner', 'bardsai-mini-da-en');
const OUT_MODEL = path.join(OUT_DIR, 'onnx', 'model_quantized.onnx');
const force = process.argv.includes('--force');

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function download(url, dest, redirects = 5) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'prompt-skjold-fetch-model' } }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (redirects <= 0) return reject(new Error('Too many redirects'));
          return resolve(download(new URL(res.headers.location, url).toString(), dest, redirects - 1));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`Download failed: HTTP ${res.statusCode} for ${url}`));
        }
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => out.close(resolve));
        out.on('error', reject);
      })
      .on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(path.join(OUT_DIR, 'onnx'), { recursive: true });
  for (const name of ['config.json', 'tokenizer.json', 'tokenizer_config.json']) {
    fs.copyFileSync(path.join(SMALL_FILES_DIR, name), path.join(OUT_DIR, name));
  }

  if (!force && fs.existsSync(OUT_MODEL) && sha256File(OUT_MODEL) === SHA256) {
    console.log(`Model already present and verified: ${path.relative(ROOT, OUT_MODEL)}`);
    return;
  }

  const tmp = `${OUT_MODEL}.download`;
  console.log(`Downloading ${SOURCE_URL}`);
  await download(SOURCE_URL, tmp);
  const actual = sha256File(tmp);
  if (actual !== SHA256) {
    fs.rmSync(tmp, { force: true });
    throw new Error(`Checksum mismatch for the downloaded model.\n  expected ${SHA256}\n  actual   ${actual}`);
  }
  fs.renameSync(tmp, OUT_MODEL);
  console.log(`Model ready: ${path.relative(ROOT, OUT_MODEL)} (sha256 ${SHA256.slice(0, 12)}...)`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
