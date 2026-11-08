#!/usr/bin/env node
/**
 * Writes the entity icons from src/shared/design/icons.json as standalone SVG files and renders an icon sheet
 * (12, 16 and 24 px, on light and dark surfaces) to docs/design/entity-icons/.
 * Usage: node scripts/export-entity-icons.js
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'design', 'entity-icons');
const icons = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/shared/design/icons.json'), 'utf8'));
const tokens = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/shared/design/tokens.json'), 'utf8')).tokens;
delete icons.$comment;

const ATTRS = 'viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
const svg = (body, size, extra = '') => `<svg ${ATTRS.replace('width="16" height="16"', `width="${size}" height="${size}"`)} ${extra}>${body}</svg>`;

fs.mkdirSync(path.join(OUT, 'svg'), { recursive: true });
for (const [name, body] of Object.entries(icons)) {
  fs.writeFileSync(path.join(OUT, 'svg', `${name}.svg`), `<svg xmlns="http://www.w3.org/2000/svg" ${ATTRS}>${body}</svg>\n`);
}

const LABEL = { name: 'name', email: 'email', phone: 'phone', cpr: 'cpr', address: 'address', bank: 'bank', secret: 'secret', org: 'org', job: 'job', ip: 'ip', date: 'date', misc: 'misc', check: 'check', x: 'x', plus: 'plus', shield: 'shield' };

function panel(bg, fg, dark) {
  const rows = Object.keys(icons)
    .map((name) => {
      const color = tokens[`c-${name}`] ? (dark ? '#f3f2ef' : tokens[`c-${name}`]) : fg;
      return `<tr><td class="n">${LABEL[name] || name}</td>${[12, 16, 24]
        .map((s) => `<td style="color:${color}">${svg(icons[name], s)}</td>`)
        .join('')}<td style="color:${color}"><span class="lab">${svg(icons[name], 16)} ${LABEL[name] || name}</span></td></tr>`;
    })
    .join('');
  return `<div class="panel" style="background:${bg};color:${fg};--ink:${dark ? "#f3f2ef" : "#1b1b1a"}"><table><tr><th></th><th>12</th><th>16</th><th>24</th><th>with label</th></tr>${rows}</table></div>`;
}

const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:20px;background:#e7e5e0;font:14px system-ui;display:flex;gap:20px}
.panel{border-radius:16px;padding:16px 22px;border:1px solid rgba(27,27,26,.15)}
table{border-collapse:collapse}th{font:600 12px system-ui;opacity:.6;text-align:left;padding:4px 14px 8px 0}
td{padding:6px 24px 6px 0;vertical-align:middle}td.n{font:600 12.5px system-ui;opacity:.7;width:60px}
td svg{display:block}.lab{display:inline-flex;align-items:center;gap:7px;font:600 13px system-ui}
</style><body>${panel('#f3f2ef', '#1b1b1a', false)}${panel('#1b1b1a', '#f3f2ef', true)}</body>`;
fs.writeFileSync(path.join(OUT, 'icon-sheet.html'), html);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 2 });
  await page.setContent(html);
  await page.screenshot({ path: path.join(OUT, 'icon-sheet.png'), fullPage: true });
  await browser.close();
  console.log('icons written to', OUT);
})();
