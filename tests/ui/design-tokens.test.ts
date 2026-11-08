import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Drift guard: popup/options CSS and the Shadow-DOM token block are both
 * generated from src/shared/design/tokens.json by scripts/build-tokens.js.
 * If this fails, run `npm run build:tokens`.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { render, OUT_CSS, OUT_TS } = require('../../scripts/build-tokens.js');

describe('design tokens', () => {
  const generated = render() as { css: string; ts: string };

  it('tokens.vars.css matches tokens.json', () => {
    expect(readFileSync(OUT_CSS, 'utf8')).toBe(generated.css);
  });

  it('design-tokens.generated.ts matches tokens.json', () => {
    expect(readFileSync(OUT_TS, 'utf8')).toBe(generated.ts);
  });

  it('embedded page assets (fonts, logo) are up to date', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const assets = require('../../scripts/build-page-assets.js') as { render: () => string; OUT: string };
    expect(readFileSync(assets.OUT, 'utf8')).toBe(assets.render());
  });

  it('shadow block and document block declare the same variables', () => {
    const names = (s: string) => [...s.matchAll(/--([a-z0-9-]+):/g)].map((m) => m[1]);
    expect(names(generated.ts)).toEqual(names(generated.css));
  });

  it('every category colour keeps 4.5:1 on paper', () => {
    const tokens = JSON.parse(
      readFileSync(join(__dirname, '../../src/shared/design/tokens.json'), 'utf8'),
    ).tokens as Record<string, string>;
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
        c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
      );
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const [k, v] of Object.entries(tokens)) {
      if (k.startsWith('c-')) expect(ratio(v, tokens.paper)).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(tokens['teal-ink'], tokens.paper)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(tokens['ink-3'], tokens.paper)).toBeGreaterThanOrEqual(4.5);
  });
});
