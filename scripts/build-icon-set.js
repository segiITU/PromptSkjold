#!/usr/bin/env node
/**
 * Authoring tool for the PromptSkjold marker icon set. It "draws" each glyph on the 16px grid from clean
 * points, then bakes a deterministic hand wobble into the path data (seeded per icon, no randomness at runtime)
 * and writes src/shared/design/icons.json, the single source the app uses.
 *
 * Each glyph = a faint highlighter blob (the category colour, slightly offset, via currentColor) + thin marker
 * strokes (1.25 on the 16 grid, round caps, a restrained wobble). Round 5 removed the black redaction bar everywhere.
 *
 * Usage: node scripts/build-icon-set.js   then   node scripts/export-entity-icons.js
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'src/shared/design/icons.json');

function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n) => (Math.round(n * 10) / 10).toString();

/** Hand-drawn set builder with its own seeded jitter. */
function pen(seed, wobble = 0.17) {
  const r = rng(seed);
  const j = (a = wobble) => (r() - 0.5) * 2 * a;
  return {
    /** Polyline of gently bowed segments. */
    line(points, { closed = false } = {}) {
      const pts = points.map(([x, y]) => [x + j(), y + j()]);
      if (closed) pts.push([pts[0][0] + j(0.28), pts[0][1] + j(0.28)]); // the marker does not quite meet itself
      let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        const mx = (x0 + x1) / 2;
        const my = (y0 + y1) / 2;
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.hypot(dx, dy) || 1;
        const bow = j(0.22) * Math.min(1, len / 6);
        d += `Q${f(mx - (dy / len) * bow)} ${f(my + (dx / len) * bow)} ${f(x1)} ${f(y1)}`;
      }
      return d;
    },
    /** Smooth closed or open curve through points (Catmull-Rom to cubic). */
    curve(points, { closed = false, amp = wobble } = {}) {
      const p = points.map(([x, y]) => [x + j(amp), y + j(amp)]);
      const n = p.length;
      const get = (i) => (closed ? p[(i + n) % n] : p[Math.max(0, Math.min(n - 1, i))]);
      let d = `M${f(p[0][0])} ${f(p[0][1])}`;
      const segs = closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const p0 = get(i - 1);
        const p1 = get(i);
        const p2 = get(i + 1);
        const p3 = get(i + 2);
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
      }
      return d;
    },
    circle(cx, cy, rad, k = 10) {
      const pts = [];
      const start = r() * Math.PI;
      for (let i = 0; i < k; i++) {
        const a = start + (i / k) * Math.PI * 2 * 1.04; // slight overshoot: the loop does not close exactly
        const rr = rad * (1 + j(0.05));
        pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
      }
      return this.curve(pts, { closed: false, amp: 0.04 });
    },
    /** The highlighter blob behind the glyph: irregular, slightly off-centre. */
    blob(cx, cy, rx, ry) {
      const k = 8;
      const pts = [];
      for (let i = 0; i < k; i++) {
        const a = (i / k) * Math.PI * 2 + 0.4;
        pts.push([cx + 0.25 + Math.cos(a) * rx * 1.14 * (1 + j(0.14)), cy + 0.3 + Math.sin(a) * ry * 1.14 * (1 + j(0.14))]);
      }
      return this.curve(pts, { closed: true, amp: 0.1 });
    },
  };
}

const BLOB = (d) => `<path fill="currentColor" fill-opacity=".27" stroke="none" d="${d}"/>`;
// The black redaction bar was dropped from every icon (round 5: thinner, calmer set). Kept as a no-op so the drawings below stay as authored.
const INK = () => '';
const GLYPH = (...ds) => `<path d="${ds.join('')}"/>`;

const ICONS = {};
const L = (name, build) => {
  const p = pen(name);
  let out = build(p);
  if (out.startsWith('<path fill')) {
    // the family's one signature: a short, slightly slanted highlighter swipe along the lower edge (category colour, low opacity)
    const sw = pen(name + ':swipe', 0.14);
    const swipe = `<path stroke-width="2.8" stroke-opacity=".3" d="${sw.line([[3.2, 13.8], [12.6, 12.9]])}"/>`;
    const cut = out.indexOf('/>') + 2;
    out = out.slice(0, cut) + swipe + out.slice(cut);
  }
  ICONS[name] = out;
};

// bar: false => the redaction bar is dropped because it turned to mush at 12px
L('name', (p) => BLOB(p.blob(9, 8.8, 5.6, 5.8)) + GLYPH(p.circle(8, 5.2, 2.5), p.curve([[3.2, 13.6], [3.6, 11.2], [6, 9.8], [8, 9.7], [10, 9.8], [12.4, 11.2], [12.8, 13.6]])) + INK(p.line([[5.2, 5.4], [10.8, 5.2]]), 2.4));
L('email', (p) => BLOB(p.blob(8.8, 8.6, 6.4, 5)) + GLYPH(p.line([[2, 4], [14, 4], [14, 12.4], [2, 12.4]], { closed: true }), p.line([[2.8, 5], [8, 9], [13.2, 5]]))); // bar: false (mush at 12px)
L('phone', (p) => BLOB(p.blob(8.8, 8.8, 4.8, 6.4)) + GLYPH(p.line([[4.2, 1.9], [11.8, 1.9], [11.8, 14.1], [4.2, 14.1]], { closed: true }), p.line([[5.9, 4.2], [10.1, 4.2], [10.1, 10.2], [5.9, 10.2]], { closed: true }), p.line([[7.4, 12.2], [8.6, 12.2]])));
L('cpr', (p) => BLOB(p.blob(8.8, 8.4, 6.6, 4.8)) + GLYPH(p.line([[2, 3.4], [14, 3.4], [14, 12.8], [2, 12.8]], { closed: true }), p.circle(5.4, 7, 1.5, 8), p.curve([[3.4, 11], [5.4, 9.4], [7.4, 11]]), p.line([[9, 6.4], [12.4, 6.3]]), p.line([[9, 9.4], [12.4, 9.3]])));
L('address', (p) => BLOB(p.blob(8.8, 8.4, 5, 6.2)) + GLYPH(p.curve([[8, 14.4], [5, 10.6], [3.6, 7.4], [4.6, 4.2], [8, 2.6], [11.4, 4.2], [12.4, 7.4], [11, 10.6]], { closed: true }), p.circle(8, 6.8, 1.4, 8)));
L('bank', (p) => BLOB(p.blob(8.8, 8.6, 6.6, 4.8)) + GLYPH(p.line([[2, 3.8], [14, 3.8], [14, 12.4], [2, 12.4]], { closed: true }), p.line([[2.2, 6.8], [13.8, 6.7]]), p.line([[4.2, 10], [7, 9.9]]))); // bar: false (mush at 12px)
L('secret', (p) => BLOB(p.blob(8.8, 8.6, 6, 5.6)) + GLYPH(p.circle(5.2, 10.4, 3.3, 10), p.line([[7.6, 8], [13.4, 2.4]]), p.line([[11.4, 4.4], [13.2, 6.2]])));
L('org', (p) => BLOB(p.blob(8.6, 8.8, 5.8, 6)) + GLYPH(p.line([[3, 14], [3, 3.2], [9.8, 3.2], [9.8, 14]]), p.line([[9.8, 6.8], [13, 6.8], [13, 14]]), p.line([[1.8, 14], [14.2, 14]]), p.line([[5.2, 6], [7.4, 5.9]]), p.line([[5.2, 8.8], [7.4, 8.7]]), p.line([[5.2, 11.6], [7.4, 11.5]])));
L('job', (p) => BLOB(p.blob(8.8, 9, 6.6, 4.8)) + GLYPH(p.line([[2, 5.4], [14, 5.4], [14, 13.6], [2, 13.6]], { closed: true }), p.line([[5.8, 5.4], [5.8, 3.4], [10.2, 3.4], [10.2, 5.4]]), p.line([[2.2, 9], [13.8, 8.9]]))); // bar: false (mush at 12px)
L('ip', (p) => BLOB(p.blob(8.8, 8.8, 6, 6)) + GLYPH(p.circle(8, 8, 5.8, 12), p.curve([[8, 2.2], [10.2, 5], [10.2, 11], [8, 13.8]]), p.line([[2.4, 8], [13.6, 7.9]]))); // bar: false (mush at 12px)
L('date', (p) => BLOB(p.blob(8.8, 9, 6.6, 5.6)) + GLYPH(p.line([[2, 3.6], [14, 3.6], [14, 13.8], [2, 13.8]], { closed: true }), p.line([[2.2, 7], [13.8, 6.9]]), p.line([[5.4, 1.8], [5.4, 4.6]]), p.line([[10.6, 1.8], [10.6, 4.6]]))); // bar: false (mush at 12px)
L('misc', (p) => BLOB(p.blob(8.8, 8.8, 5.8, 5.8)) + GLYPH(p.line([[1.9, 8.4], [8, 2.3], [13.4, 2.3], [13.6, 8], [7.5, 14]], { closed: true }), p.circle(10.3, 5.7, 1.2, 8)));
L('check', (p) => GLYPH(p.line([[3.2, 8.6], [6.2, 11.6], [12.8, 4.6]])));
L('x', (p) => GLYPH(p.line([[4, 4], [12, 12]]), p.line([[12, 4], [4, 12]])));
L('plus', (p) => GLYPH(p.line([[8, 3], [8, 13]]), p.line([[3, 8], [13, 8]])));
L('shield', (p) => GLYPH(p.curve([[8, 1.8], [13, 3.6], [13, 7.6], [11.4, 11.4], [8, 14.2], [4.6, 11.4], [3, 7.6], [3, 3.6]], { closed: true })));

ICONS.$comment =
  'Generated by scripts/build-icon-set.js (marker-style set: highlighter blob + thin wobbly 1.25px strokes). 16px grid, round caps/joins, currentColor. Do not hand-edit; edit the generator. Consumed by src/shared/design/categories.ts and scripts/export-entity-icons.js.';

const ordered = { $comment: ICONS.$comment };
for (const k of Object.keys(ICONS)) if (k !== '$comment') ordered[k] = ICONS[k];
fs.writeFileSync(OUT, JSON.stringify(ordered, null, 2) + '\n');
console.log('wrote', path.relative(process.cwd(), OUT));
