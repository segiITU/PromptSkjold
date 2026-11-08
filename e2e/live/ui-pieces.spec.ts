import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium, expect, test, type Browser, type Page } from '@playwright/test';

/**
 * Renders every small in-page piece (banner, toast, scanning indicator, status chip, the three dialogs) on a
 * plain local page, in Danish and English, and checks their keyboard behaviour. Opt-in:
 *   UI_SHOTS_DIR=<dir> npx playwright test --config e2e/live/playwright.screens.config.ts ui-pieces
 * The bundle comes from e2e/live/ui-pieces/webpack.config.js; nothing here touches the network.
 */
const OUT = process.env.UI_SHOTS_DIR ?? '';
test.skip(!OUT, 'set UI_SHOTS_DIR');
test.setTimeout(180_000);

let browser: Browser;
let bundle = '';

test.beforeAll(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const outDir = path.join(OUT, 'pieces-bundle');
  execFileSync(process.execPath, [path.resolve('node_modules/webpack/bin/webpack.js'), '--config', 'e2e/live/ui-pieces/webpack.config.js', '--env', `out=${outDir}`], { stdio: 'pipe' });
  bundle = path.join(outDir, 'pieces.js');
  browser = await chromium.launch();
});

test.afterAll(async () => {
  await browser?.close();
});

const PAGE_HTML = `<!doctype html><html><body style="margin:0;font-family:Georgia,serif;background:#fff">
<main style="padding:24px;max-width:640px">
  <h1>Chat</h1>
  <div id="reply" style="font-size:16px;line-height:1.6">Hej [PERSON_1], jeg skriver til dig på [EMAIL_1] i dag.</div>
  <textarea id="box" style="width:100%;height:70px;margin-top:20px"></textarea>
</main></body></html>`;

async function open(lang: 'da' | 'en', size = { width: 900, height: 600 }): Promise<Page> {
  const page = await browser.newPage({ viewport: size });
  await page.setContent(PAGE_HTML);
  await page.addScriptTag({ path: bundle });
  await page.evaluate((l) => (window as any).PK.setLanguage(l), lang);
  await page.evaluate(() => {
    (window as any).__keys = 0;
    document.body.addEventListener('keydown', () => ((window as any).__keys += 1));
  });
  return page;
}

for (const lang of ['da', 'en'] as const) {
  test(`banner, toast, indicator, chip in ${lang}`, async () => {
    const page = await open(lang);
    await page.evaluate(() => {
      const PK = (window as any).PK;
      const el = document.getElementById('reply')!;
      const values: Record<string, string> = { '[PERSON_1]': 'Mette Holm', '[EMAIL_1]': 'mette@firma.dk' };
      PK.attachDeAnonBanner(
        el,
        (text: string) => {
          const matches: any[] = [];
          let deAnonText = text;
          for (const [token, original] of Object.entries(values)) {
            const i = text.indexOf(token);
            if (i >= 0) {
              matches.push({ start: i, end: i + token.length, matchText: token, originalText: original, styleKey: 'misc' });
              deAnonText = deAnonText.replace(token, original);
            }
          }
          return { matches, deAnonText };
        },
        { theme: 'light' },
      );
    });
    await page.screenshot({ path: path.join(OUT, `piece-banner-${lang}.png`) });
    await page.evaluate(() => {
      const PK = (window as any).PK;
      new PK.ClipboardToast('light', { onReplace() {} }).show();
      new PK.ScanningIndicator('light', () => {}).start();
      const chip = new PK.PageStatusChip('light');
      chip.update('model-failed', { ...PK.chipReasonMessage('model-failed'), technical: 'Failed to fetch model (raw engine error)' });
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `piece-toast-indicator-chip-${lang}.png`) });
    await page.evaluate(() => {
      const PK = (window as any).PK;
      const chip = new PK.PageStatusChip('light');
      chip.update('pattern-only');
    });
    await page.close();
  });

  test(`dialogs in ${lang}: look and keyboard`, async () => {
    // cancel decision dialog
    let page = await open(lang);
    await page.evaluate(() => {
      (window as any).__r = (window as any).PK.CancelDecisionDialog && new (window as any).PK.CancelDecisionDialog('light').show();
      (window as any).__r.then((v: unknown) => ((window as any).__result = v));
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, `piece-cancel-dialog-${lang}.png`) });
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => (window as any).__keys)).toBe(0); // Tab/Esc never reach the page
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => (window as any).__result !== undefined);
    expect(await page.evaluate(() => (window as any).__result)).toMatchObject({ dismissed: true });
    expect(await page.evaluate(() => (window as any).__keys)).toBe(0);
    await page.close();

    // critical local AI modal
    page = await open(lang);
    await page.evaluate(() => {
      (window as any).__dismissed = false;
      const m = new (window as any).PK.CriticalLocalAiModal('light', {
        onDismiss: () => ((window as any).__dismissed = true),
        onOpenSettings: () => undefined,
      });
      m.show();
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, `piece-critical-modal-${lang}.png`) });
    const inModal = async () =>
      page.evaluate(() => !!document.getElementById('pg-critical-local-ai-modal-host')?.shadowRoot?.activeElement);
    expect(await inModal()).toBe(true); // focus moved in
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      expect(await inModal()).toBe(true); // Tab stays inside
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => (window as any).__dismissed === true);
    expect(await page.evaluate(() => (window as any).__keys)).toBe(0);
    await page.close();

    // image check dialog
    page = await open(lang, { width: 1000, height: 640 });
    await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 600;
      c.height = 400;
      const g = c.getContext('2d')!;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 600, 400);
      g.fillStyle = '#222';
      g.font = '22px serif';
      g.fillText('Mette Holm Jensen', 40, 80);
      g.fillText('CPR 120485-1234', 40, 140);
      g.fillText('mette@firma.dk', 40, 200);
      const url = c.toDataURL();
      const d = new (window as any).PK.ImageCheckDialog('light');
      (window as any).__img = d.show({
        fileName: 'brev.png',
        imageUrl: url,
        canRedact: true,
        items: [
          { type: 'CPR', text: '120485-1234', boxes: [{ x0: 40, y0: 120, x1: 260, y1: 150 }] },
          { type: 'EMAIL', text: 'mette@firma.dk', boxes: [{ x0: 40, y0: 180, x1: 230, y1: 210 }] },
          { type: 'PERSON', text: 'Mette Holm Jensen', boxes: [] },
        ],
      });
      (window as any).__img.then((v: string) => ((window as any).__imgResult = v));
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, `piece-image-dialog-${lang}.png`) });
    const dlgFocus = () => page.evaluate(() => !!document.getElementById('pg-image-check-dialog-host')?.shadowRoot?.activeElement);
    expect(await dlgFocus()).toBe(true);
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      expect(await dlgFocus()).toBe(true);
    }
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => (window as any).__imgResult !== undefined);
    expect(await page.evaluate(() => (window as any).__imgResult)).toBe('drop'); // Esc = "don't attach": nothing leaves
    expect(await page.evaluate(() => (window as any).__keys)).toBe(0);
    await page.close();
  });
}

for (const lang of ['da', 'en'] as const) {
  test(`office notice in ${lang}`, async () => {
    const page = await open(lang);
    await page.evaluate(() => (window as any).PK.showOfficeNotice({ enable: async () => undefined, theme: 'light' }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `piece-office-notice-${lang}.png`) });
    await page.evaluate(() => {
      const host = document.getElementById('pg-office-notice-host')!;
      // closed shadow root: use the keyboard instead (Tab to the button, Enter)
      void host;
    });
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, `piece-office-notice-${lang}-on.png`) });
    await page.close();
  });
}
