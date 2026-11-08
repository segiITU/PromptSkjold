/** @jest-environment jsdom */

import { ImageCheckDialog } from '../../src/ui/image-check-dialog/image-check-dialog';

describe('ImageCheckDialog text copy', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  const root = (): ShadowRoot => document.getElementById('pg-image-check-dialog-host')!.shadowRoot!;
  const buttons = (): string[] => [...root().querySelectorAll('button')].map((b) => b.textContent ?? '');

  it('offers the anonymised text copy only for a problem that asks for it', () => {
    void new ImageCheckDialog('light').show({ fileName: 'a.pdf', items: [], problem: 'x', canTextCopy: true });
    expect(buttons()).toContain('Attach as anonymised text');
    expect(root().textContent).toContain('machine-read version');
    document.body.innerHTML = '';

    void new ImageCheckDialog('light').show({ fileName: 'a.pdf', items: [], problem: 'x' });
    expect(buttons()).not.toContain('Attach as anonymised text');
  });

  it('names the items that could not be found', () => {
    void new ImageCheckDialog('light').show({ fileName: 'a.pdf', items: [], problem: 'x', missed: ['Anders Holm', '2026-PII-1045'] });
    expect(root().textContent).toContain('Not found: Anders Holm · 2026-PII-1045');
  });

  it('resolves text when the button is clicked, and Esc still means drop', async () => {
    const pending = new ImageCheckDialog('light').show({ fileName: 'a.pdf', items: [], problem: 'x', canTextCopy: true });
    ([...root().querySelectorAll('button')].find((b) => b.textContent === 'Attach as anonymised text') as HTMLButtonElement).click();
    await expect(pending).resolves.toBe('text');
    document.body.innerHTML = '';

    const escaped = new ImageCheckDialog('light').show({ fileName: 'a.pdf', items: [], problem: 'x', canTextCopy: true });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await expect(escaped).resolves.toBe('drop');
  });
});
