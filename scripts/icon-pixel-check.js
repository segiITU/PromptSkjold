#!/usr/bin/env node
/** Renders the icons at true 12px and 16px (device scale 1) so legibility can be judged, then upscales with nearest-neighbour. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
// usage: node scripts/icon-pixel-check.js [outDir] [iconsJson] [strokeWidth] [outName]
const icons = JSON.parse(fs.readFileSync(process.argv[3] || path.join(__dirname, '..', 'src/shared/design/icons.json'), 'utf8'));
const SW = process.argv[4] || '1.5';
const OUTNAME = process.argv[5] || 'icon-pixels-1x.png';
const tokens = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src/shared/design/tokens.json'), 'utf8')).tokens;
delete icons.$comment;
const out = process.argv[2] || path.join(__dirname, '..', 'docs', 'design', 'entity-icons');
const names = Object.keys(icons).filter((n) => tokens[`c-${n}`]);
const svg = (n, s) => `<svg viewBox="0 0 16 16" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="${SW}" stroke-linecap="round" stroke-linejoin="round">${icons[n]}</svg>`;
const row = (s) => `<div class="r">${names.map((n) => `<span style="color:${tokens['c-' + n]}">${svg(n, s)}</span>`).join('')}</div>`;
const html = `<!doctype html><style>body{margin:0;background:#f3f2ef;padding:6px}.r{display:flex;gap:10px;margin:4px 0}span{display:block;line-height:0}</style><body>${row(12)}${row(16)}</body>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 12 * (16 + 10) + 20, height: 12 + 16 + 40 }, deviceScaleFactor: 1 });
  await p.setContent(html);
  await p.screenshot({ path: path.join(out, OUTNAME) });
  await b.close();
  console.log('names:', names.join(' '));
})();
