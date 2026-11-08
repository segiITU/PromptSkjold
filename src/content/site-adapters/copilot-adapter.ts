import type { SiteAdapter } from './adapter-interface';
import { insertTextCompat } from './adapter-interface';

/**
 * Microsoft Copilot (copilot.microsoft.com, copilot.com).
 *
 * The selectors below are the markup Copilot used when this adapter was
 * written (a textarea with id `userInput` and a submit button with a
 * `data-testid`), followed by the generic fallbacks, so a redesign costs
 * precision and not the feature. They have not been verified on the live site
 * (Copilot needs a sign-in); the paste, submit and attach interception work
 * from the composer found here.
 */
export class CopilotAdapter implements SiteAdapter {
  readonly name = 'Copilot';
  readonly canTellReplies = false;
  readonly sendButtonSelectors = [
    'button[data-testid="submit-button"]',
    'button[aria-label="Submit message"]',
    'button[aria-label="Send message"]',
    'form button[type="submit"]',
  ];

  getInputElement(): HTMLElement | null {
    return (
      document.querySelector<HTMLElement>('textarea#userInput') ||
      document.querySelector<HTMLElement>('textarea[data-testid="composer-input"]') ||
      document.querySelector<HTMLElement>('[contenteditable="true"][role="textbox"]') ||
      document.querySelector<HTMLElement>('[contenteditable="true"]') ||
      document.querySelector<HTMLElement>('textarea')
    );
  }

  getResponseElements(): HTMLElement[] {
    return [];
  }

  insertText(element: HTMLElement, text: string): void {
    if (element instanceof HTMLTextAreaElement) {
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      insertTextCompat(element, text);
    }
  }

  observeResponses(_callback: (element: HTMLElement) => void): MutationObserver {
    const observer = new MutationObserver(() => {});
    observer.observe(document.body, { childList: true, subtree: true });
    return observer;
  }
}
