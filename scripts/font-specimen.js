#!/usr/bin/env node
/**
 * Renders a Danish specimen sheet (real UI strings) for candidate font pairings and screenshots it.
 * Usage: node scripts/font-specimen.js <fontpick dir with extracted @fontsource packages> <out dir>
 * Dev tooling only; nothing here is shipped.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');

const [, , PICK, OUT] = process.argv;
if (!PICK || !OUT) throw new Error('usage: font-specimen.js <fontpick dir> <out dir>');
fs.mkdirSync(OUT, { recursive: true });

const F = (pkg, file) => 'file:///' + path.join(PICK, pkg, 'package', 'files', file).replace(/\\/g, '/');

const PAIRS = [
  {
    id: 'P1',
    name: 'Inter + Source Serif 4',
    sans: ['Inter', 'variable', F('fontsource-variable-inter-5.3.0', 'inter-latin-wght-normal.woff2')],
    serif: ['Source Serif 4', 'variable', F('fontsource-variable-source-serif-4-5.3.1', 'source-serif-4-latin-wght-normal.woff2')],
    mark: { weight: 650, spacing: '-0.02em', size: 26 },
  },
  {
    id: 'P2',
    name: 'IBM Plex Sans + IBM Plex Serif',
    sans: ['IBM Plex Sans', [400, 500, 600, 700], (w) => F('fontsource-ibm-plex-sans-5.3.0', `ibm-plex-sans-latin-${w}-normal.woff2`)],
    serif: ['IBM Plex Serif', [400, 500], (w) => F('fontsource-ibm-plex-serif-5.3.0', `ibm-plex-serif-latin-${w}-normal.woff2`)],
    mark: { weight: 600, spacing: '-0.01em', size: 26 },
  },
  {
    id: 'P3',
    name: 'Source Sans 3 + Newsreader',
    sans: ['Source Sans 3', [400, 500, 600, 700], (w) => F('fontsource-source-sans-3-5.3.1', `source-sans-3-latin-${w}-normal.woff2`)],
    serif: ['Newsreader', 'variable', F('fontsource-variable-newsreader-5.3.0', 'newsreader-latin-wght-normal.woff2')],
    mark: { weight: 650, spacing: '-0.01em', size: 28 },
  },
  {
    id: 'P4',
    name: 'Figtree + Literata',
    sans: ['Figtree', 'variable', F('fontsource-variable-figtree-5.3.0', 'figtree-latin-wght-normal.woff2')],
    serif: ['Literata', 'variable', F('fontsource-variable-literata-5.3.0', 'literata-latin-wght-normal.woff2')],
    mark: { weight: 700, spacing: '-0.02em', size: 26 },
  },
];

function faces([family, weights, src]) {
  if (weights === 'variable') return `@font-face{font-family:"${family}";src:url("${src}") format("woff2");font-weight:100 900;}`;
  return weights.map((w) => `@font-face{font-family:"${family}";src:url("${src(w)}") format("woff2");font-weight:${w};}`).join('');
}

const card = (p, ui, voice) => `
<section class="pair" style="--ui:'${ui}';--voice:'${voice}'">
  <h2 class="label">${p.id}. ${p.name}</h2>
  <div class="row">
    <div class="popup">
      <div class="head"><img src="${F('', '').replace('file:///', 'file:///')}" alt="" hidden><b class="mark" style="font-weight:${p.mark.weight};letter-spacing:${p.mark.spacing};font-size:${p.mark.size}px">PromptSkjold</b><small>v0.5.0 · da-pii-mini-preview-21m (Danish/English, 22 MB)</small></div>
      <div class="status"><span class="dot"></span><strong>Tjek er slået til</strong><br><span class="sub">PromptSkjold tjekker teksten på din enhed, før den sendes.</span></div>
      <div class="pills"><span>Tjek: til</span><span>Lokal AI: Klar: BardsAI</span><span>Mønstre: Indlæst</span></div>
      <p class="fine">Tjekket bruger en lokal AI-model på din enhed. Den kan overse ting eller markere forkert, så læs teksten igennem, før du sender den.</p>
      <div class="rows"><div><b>Identitet</b><br><span>Navne, brugernavne, id og fødselsdato</span></div><div><b>Penge og id-numre</b><br><span>Kort, IBAN, konti, CPR</span></div></div>
    </div>
    <div class="overlay">
      <h3 class="title">Tjek, før du sender</h3>
      <p class="sub">PromptSkjold har fundet 5 steder i teksten. Den kan overse noget, så læs den selv igennem.</p>
      <div class="finding"><span class="kind"><i></i>E-mail</span><div class="val">mette.holm@firma.dk</div><div class="ph">Bliver til <u>[EMAIL_1]</u></div><div class="seg"><b>Erstat</b><span>Behold</span><span>Tillad altid</span></div></div>
      <div class="finding"><span class="kind"><i></i>CPR-nummer</span><div class="val">120485-1234</div><div class="ph">Sikkerhed 100 %</div></div>
      <p class="letter">Du kan skrive til mig på mette.holm@firma.dk eller ringe på +45 28 71 40 93. Mit CPR-nummer er 120485-1234, og beløbet er 1.234,56 kr. “Tak” for ‘hjælpen’ – æ ø å Æ Ø Å.</p>
      <p class="nums">0123456789 · 11:11 · 98,76 · 1.000</p>
    </div>
  </div>
</section>`;

const html = `<!doctype html><meta charset="utf-8"><style>
${PAIRS.map((p) => faces(p.sans) + faces(p.serif)).join('\n')}
body{margin:0;background:#e7e5e0;color:#1b1b1a;padding:20px;width:1500px}
.pair{margin:0 0 26px;font-family:var(--ui),sans-serif}
.label{font:600 15px system-ui;margin:0 0 8px}
.row{display:grid;grid-template-columns:420px 1fr;gap:20px}
.popup,.overlay{background:#f3f2ef;border:1px solid rgba(27,27,26,.15);border-radius:16px;padding:16px}
.overlay{background:#fbfaf7}
.head{display:flex;flex-direction:column;margin-bottom:12px}.head small{color:#66655f;font-size:12px;margin-top:2px}
.status{background:#d8f1ee;border-radius:14px;padding:12px;margin-bottom:10px;font-size:13.5px}
.status strong{font-family:var(--ui);font-weight:600;font-size:20px}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#3ec6bd;margin-right:8px}
.sub{color:#1b625d}.pills span{display:inline-block;border:1px solid #2b8f88;background:#d8f1ee;border-radius:99px;padding:3px 10px;font-size:12.5px;font-weight:600;margin:0 6px 6px 0}
.fine{font-size:12.5px;color:#66655f;line-height:1.5}.rows div{padding:8px 0;border-top:1px solid rgba(27,27,26,.12);font-size:13.5px}.rows span{font-size:12.5px;color:#66655f}
.title{font:600 26px/1.15 var(--ui);letter-spacing:-0.01em;margin:0 0 4px}
.overlay .sub{color:#66655f;font-size:13.5px;margin:0 0 12px}
.finding{border-top:1px solid rgba(27,27,26,.12);padding:10px 0;width:320px;font-size:14px}.kind{font-weight:600;font-size:12.5px;color:#4f4e49}.kind i{display:inline-block;width:9px;height:9px;border-radius:50%;background:#7a4aa6;margin-right:7px}
.val{font-weight:600;font-size:14.5px;margin:3px 0}.ph{font-size:12.5px;color:#66655f;margin-bottom:6px}.ph u{text-decoration:none;background:#d8f1ee;color:#1b625d;border-radius:5px;padding:0 5px;font-weight:600}
.seg{display:flex;border:1px solid rgba(27,27,26,.22);border-radius:99px;padding:2px;font-size:12px;font-weight:600}.seg b,.seg span{flex:1;text-align:center;padding:4px;border-radius:99px}.seg b{background:#1b1b1a;color:#f3f2ef}
.letter{font:400 16px/1.7 var(--voice),serif;max-width:560px;background:#fffdf8;border:1px solid rgba(27,27,26,.12);border-radius:12px;padding:12px 16px}
.nums{font:500 15px var(--ui);font-variant-numeric:tabular-nums lining-nums}
.mark{display:block}
</style><body>${PAIRS.map((p) => card(p, p.sans[0], p.serif[0])).join('')}</body>`;

const htmlPath = path.join(OUT, 'specimen.html');
fs.writeFileSync(htmlPath, html);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1540, height: 900 } });
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  const sections = await page.$$('.pair');
  for (let i = 0; i < sections.length; i += 1) await sections[i].screenshot({ path: path.join(OUT, `specimen-${PAIRS[i].id}.png`) });
  await page.screenshot({ path: path.join(OUT, 'specimen-all.png'), fullPage: true });
  await browser.close();
  console.log('specimens in', OUT);
})();
