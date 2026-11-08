/**
 * Shared design-system primitives for Shadow DOM UI mounted from content
 * scripts. Shadow roots do not get the popup/options stylesheet, so the tokens
 * are embedded from the generated block (src/shared/design/tokens.json via
 * scripts/build-tokens.js): there is one token source, nothing is copied by
 * hand. The legacy `--pg-*` names the in-page pieces use are aliases of it.
 */
import { SHADOW_DESIGN_TOKENS } from './design-tokens.generated';

export const SHADOW_DESIGN_SYSTEM_STYLES = `
  ${SHADOW_DESIGN_TOKENS}

  :host {
    all: initial;
    --pg-font-sans: var(--f-ui);
    --pg-color-focus: var(--teal);
    --pg-color-text-light: var(--paper);
    --pg-color-muted-dark: var(--muted-dark);
    --pg-color-header: var(--ink);
    --pg-color-surface: var(--paper);
    --pg-color-card: var(--sheet);
    --pg-color-border: var(--line-2);
    --pg-color-ink: var(--ink);
    --pg-color-muted: var(--ink-3);
    --pg-color-subtle: var(--ink-3);
    --pg-color-accent: var(--teal);
    --pg-color-accent-hover: var(--teal-hover);
    --pg-color-accent-soft: var(--teal-wash);
    --pg-color-success: var(--teal);
    --pg-color-warning: var(--amber);
    --pg-radius-sm: 12px;
    --pg-radius-md: 16px;
    --pg-shadow-floating: 0 14px 30px -10px rgb(0 0 0 / 50%);
    --pg-shadow-floating-light: var(--shadow-float);
  }

  .pg-design-surface {
    box-sizing: border-box;
    border: 1px solid var(--line-dark);
    background: var(--ink);
    color: var(--paper);
    box-shadow: var(--pg-shadow-floating);
    font-family: var(--pg-font-sans);
    letter-spacing: 0;
  }

  .pg-design-surface[data-theme="light"] {
    border-color: var(--line-2);
    background: var(--sheet);
    color: var(--ink);
    box-shadow: var(--pg-shadow-floating-light);
    --pg-color-focus: var(--ink);
  }

  .pg-design-muted {
    color: var(--pg-color-muted-dark);
  }

  .pg-design-surface[data-theme="light"] .pg-design-muted {
    color: var(--ink-3);
  }

  .pg-design-button {
    appearance: none;
    box-sizing: border-box;
    border: 1.5px solid transparent;
    border-radius: 999px;
    background: var(--teal);
    color: var(--ink);
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.2;
    transition:
      background 140ms ease,
      border-color 140ms ease,
      color 140ms ease;
  }

  .pg-design-button:hover {
    background: var(--teal-hover);
  }

  .pg-design-button-subtle {
    border-color: var(--button-line-dark);
    background: transparent;
    color: var(--paper);
  }

  .pg-design-button-subtle:hover {
    background: rgb(243 242 239 / 12%);
  }

  .pg-design-surface[data-theme="light"] .pg-design-button-subtle {
    border-color: var(--ink);
    background: transparent;
    color: var(--ink);
  }

  .pg-design-surface[data-theme="light"] .pg-design-button-subtle:hover {
    background: rgb(27 27 26 / 6%);
  }

  .pg-design-button:focus-visible {
    outline: 2.5px solid var(--pg-color-focus);
    outline-offset: 2px;
  }

  /* Used by horizontally centered fixed surfaces that set left: 50%. */
  @keyframes pg-design-pop-in {
    from {
      opacity: 0;
      transform: translate(-50%, 8px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0) scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 1ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: 1ms !important;
    }
  }
`;
