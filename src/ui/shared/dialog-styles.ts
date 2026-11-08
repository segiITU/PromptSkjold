/**
 * One look for the in-page dialogs (cancel decision, image check, critical
 * local AI). Same sheet-on-scrim language as the review overlay. The dialogs
 * ignore the old dark/light setting: like the overlay they always use paper.
 */
import { SHADOW_DESIGN_TOKENS } from './design-tokens.generated';

export const SHADOW_DIALOG_STYLES = `
  ${SHADOW_DESIGN_TOKENS}
  :host { all: initial; }

  .backdrop,
  .pg-critical-modal-backdrop {
    position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: center;
    justify-content: center; padding: 20px; background: var(--scrim);
    font-family: var(--f-ui); color: var(--ink); letter-spacing: normal; text-transform: none; text-align: left;
  }
  .backdrop *, .backdrop *::before, .backdrop *::after,
  .pg-critical-modal-backdrop *, .pg-critical-modal-backdrop *::before, .pg-critical-modal-backdrop *::after { box-sizing: border-box; }

  .dialog,
  .pg-critical-modal {
    width: min(440px, 100%); max-height: 90vh; overflow: auto;
    border-radius: var(--r-xl); padding: 24px 24px 20px; background: var(--sheet); color: var(--ink);
    border: 1px solid var(--line); box-shadow: var(--shadow-lift);
    animation: pk-rise 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  }
  .dialog.wide { width: min(780px, 100%); }
  @keyframes pk-rise { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }

  .header { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
  h2, .pg-critical-modal-title {
    margin: 0 0 10px; font: 600 21px/1.2 var(--f-ui); font-variant-numeric: lining-nums; letter-spacing: -0.005em;
  }
  p, .pg-critical-modal-body { margin: 0 0 14px; font-size: 14px; line-height: 1.5; color: var(--ink-2); }
  .pg-critical-modal-list { margin: 0 0 18px; padding-left: 18px; font-size: 13.5px; line-height: 1.5; color: var(--ink-2); display: grid; gap: 6px; }
  .close {
    appearance: none; border: 0; background: transparent; color: var(--ink-3); cursor: pointer;
    font-size: 22px; line-height: 1; padding: 2px 6px; border-radius: 50%;
  }
  .close:hover { background: rgb(27 27 26 / 9%); color: var(--ink); }
  label { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; font-size: 14px; font-weight: 500; color: var(--ink); }
  input[type="checkbox"] { width: 18px; height: 18px; accent-color: var(--ink); }

  .file { font-weight: 600; word-break: break-all; color: var(--ink); }
  .cols { display: flex; gap: 18px; align-items: flex-start; margin-bottom: 14px; }
  .preview { position: relative; flex: 0 0 300px; max-width: 45%; line-height: 0; border-radius: 6px; overflow: hidden; border: 1px solid #dedbd2; background: var(--sheet-warm); }
  .preview img { width: 100%; height: auto; display: block; }
  .box { position: absolute; border: 2px solid var(--c-secret); background: rgb(143 31 103 / 18%); border-radius: 3px; }
  ul.items { flex: 1; margin: 0; padding: 0; list-style: none; font-size: 14px; min-width: 0; }
  ul.items li { display: flex; gap: 10px; align-items: baseline; padding: 7px 0; border-bottom: 1px solid var(--line); }
  .type { flex: 0 0 auto; font-size: 12.5px; font-weight: 600; color: var(--teal-ink); min-width: 96px; }
  .type .ic { display: inline-block; width: 15px; height: 15px; vertical-align: -3px; margin-right: 6px; color: var(--teal-ink); }
  .type .ic svg { display: block; width: 100%; height: 100%; }
  .value { overflow-wrap: anywhere; font-weight: 600; }
  .unlocated { font-size: 12px; color: var(--ink-3); }
  .note { font-size: 13px; margin-bottom: 12px; color: var(--warn); font-weight: 500; }

  .actions, .pg-critical-modal-actions { display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
  button { font: inherit; }
  .secondary, .primary, .pg-critical-modal-button {
    border-radius: 999px; padding: 10px 18px; cursor: pointer; font-size: 14px; font-weight: 600; line-height: 1.2;
    border: 1.5px solid transparent;
  }
  .secondary, .pg-critical-modal-button-secondary { background: transparent; color: var(--ink); border-color: var(--ink); }
  .secondary:hover, .pg-critical-modal-button-secondary:hover { background: rgb(27 27 26 / 6%); }
  .primary, .pg-critical-modal-button-primary { background: var(--teal); color: var(--ink); }
  .primary:hover, .pg-critical-modal-button-primary:hover { background: var(--teal-hover); }
  button:disabled { opacity: 0.45; cursor: not-allowed; }
  button:focus-visible, input:focus-visible { outline: 2.5px solid var(--ink); outline-offset: 2px; }

  @media (max-width: 560px) { .cols { flex-direction: column; } .preview { max-width: 100%; flex-basis: auto; width: 100%; } .actions > button { flex: 1 1 100%; } }
  @media (prefers-reduced-motion: reduce) { .dialog, .pg-critical-modal { animation: none; } }
`;
