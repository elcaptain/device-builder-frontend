import { css } from "lit";

/**
 * The dashboard's card action-button language — the compact ``.action-btn``
 * row at the bottom of a device card (filled primary, tinted accent, ghost,
 * and the icon-only kebab/tile variants).
 *
 * Extracted from ``device-card/styles.ts`` so ESPHome Web's cards can render
 * the exact same buttons; both consumers compose this module into their
 * style arrays, keeping the two visually locked together.
 */
export const actionBtnStyles = css`
  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px;
    border-radius: var(--wa-border-radius-m);
    font-size: var(--wa-font-size-xs);
    font-weight: var(--wa-font-weight-bold);
    font-family: inherit;
    cursor: pointer;
    border: var(--wa-border-width-s) solid transparent;
    /* Reset anchor presentation so link-shaped actions match buttons. */
    text-decoration: none;
    transition:
      background 0.12s,
      border-color 0.12s;
    white-space: nowrap;
    min-width: 0;
  }

  .action-btn wa-icon {
    font-size: 15px;
  }

  .action-btn--primary {
    background: var(--esphome-primary);
    color: var(--esphome-on-primary);
  }

  .action-btn--primary:hover {
    background: var(--esphome-primary-hover);
  }

  .action-btn--accent {
    background: var(--esphome-tint);
    color: var(--esphome-primary);
    border-color: var(--esphome-tint-border);
  }

  .action-btn--accent:hover {
    background: var(--esphome-tint-strong);
    border-color: var(--esphome-primary);
  }

  .action-btn--ghost {
    background: transparent;
    color: var(--wa-color-text-normal);
    border-color: var(--wa-color-surface-border);
  }

  .action-btn--ghost:hover {
    background: var(--wa-color-surface-lowered);
    border-color: var(--wa-color-text-quiet);
  }

  .action-btn--icon-only {
    padding: 5px;
    flex-shrink: 0;
    margin-left: auto;
  }

  /* Compact icon-only that sits inline with labelled buttons — same
     visual size as the kebab but without the auto left-margin. */
  .action-btn--tile {
    padding: 5px;
    flex-shrink: 0;
  }

  .action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    pointer-events: none;
  }
`;
