import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium, expect, test, type Browser } from '@playwright/test';

/**
 * Screenshots of the popup Test tab with the checked text highlighted, in DA and EN, from a standalone bundle of
 * the real TestTab (no extension build needed). Opt-in:
 *   UI_SHOTS_DIR=<dir> npx playwright test --config e2e/live/playwright.screens.config.ts test-tab-highlight
 */
const OUT = process.env.UI_SHOTS_DIR ?? '';
test.skip(!OUT, 'set UI_SHOTS_DIR');
test.setTimeout(120_000);

let browser: Browser;
let server: http.Server;
let base = '';

const TYPES: Record<string, string> = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2' };

test.beforeAll(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const bundle = path.join(OUT, 'test-tab-bundle');
  execFileSync(process.execPath, [path.resolve('node_modules/webpack/bin/webpack.js'), '--config', 'e2e/live/test-tab-harness/webpack.config.js', '--env', `out=${bundle}`], { stdio: 'pipe' });
  fs.writeFileSync(path.join(bundle, 'index.html'), '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/harness.css"><body style="margin:0;background:#f3f2ef"><div style="width:420px;padding:16px;box-sizing:border-box"><div id="app"></div></div><script src="/harness.js"></script>');
  const fonts = path.resolve('src/assets/fonts');
  server = http.createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    const file = url.startsWith('/fonts/') ? path.join(fonts, path.basename(url)) : path.join(bundle, url === '/' ? 'index.html' : url);
    fs.readFile(file, (err, data) => {
      if (err) { res.statusCode = 404; res.end(); return; }
      res.setHeader('content-type', TYPES[path.extname(file)] ?? 'application/octet-stream');
      res.end(data);
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  browser = await chromium.launch();
});

test.afterAll(async () => {
  await browser?.close();
  server?.close();
});

for (const lang of ['da', 'en'] as const) {
  for (const mode of ['ideal', 'real'] as const) {
    test(`test tab highlights (${lang}, ${mode})`, async () => {
      const page = await browser.newPage({ viewport: { width: 452, height: 900 }, deviceScaleFactor: 2 });
      await page.goto(base);
      await page.evaluate(([l, m]) => (window as any).show(l, m), [lang, mode] as const);
      await page.evaluate(() => document.fonts.ready);
      const marks = page.locator('#pk-checked-text mark');
      await expect(marks).toHaveCount(6);
      // every mark carries its category name for assistive tech and as a tooltip
      expect(await marks.first().getAttribute('title')).toMatch(/\d+ %/);
      // clicking a mark brings its list entry into focus
      await marks.nth(3).click();
      await expect(page.locator('#pk-res-3')).toBeFocused();
      await page.waitForTimeout(1700);
      await page.screenshot({ path: path.join(OUT, `test-tab-highlight-${lang}-${mode}.png`), fullPage: true });
      await page.close();
    });
  }
}

for (const lang of ['da', 'en'] as const) {
  test(`rules list and review overlay (${lang})`, async () => {
    const page = await browser.newPage({ viewport: { width: 452, height: 760 }, deviceScaleFactor: 2 });
    await page.goto(base);
    await page.evaluate((l) => (window as any).showRules(l), lang);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(OUT, `rules-${lang}.png`), fullPage: true });
    await page.close();

    const big = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await big.goto(base);
    await big.evaluate((l) => (window as any).showOverlay(l), lang);
    await big.waitForTimeout(1800);
    await big.screenshot({ path: path.join(OUT, `overlay-icons-${lang}.png`) });
    await big.close();
  });
}
