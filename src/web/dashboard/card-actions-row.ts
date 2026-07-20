import { css } from "lit";

/**
 * Layout for the slotted actions row inside ``esphome-web-card`` — mirrors
 * the builder card's ``.device-actions`` (compact row, bottom of the card).
 * Lives with the consumers because slotted content is styled by the shadow
 * tree that authors it, not by the card that slots it.
 */
export const cardActionsRowStyles = css`
  .card-actions-row {
    display: flex;
    align-items: center;
    gap: var(--wa-space-2xs);
    padding: var(--wa-space-s) var(--wa-space-m);
  }
`;
