import { css } from "lit";

/**
 * Shared chrome for the "branded" wizard-style dialogs — a compact,
 * primary-colored header bar, a flush 40×40 close button, and a back button
 * slotted into ``esphome-base-dialog``'s ``header-prefix``. The create-config
 * wizard and the add-component dialog both render this exact header, so the
 * rules live here once instead of drifting between two copies (#549).
 *
 * Drop into a consumer's ``static styles`` array (after ``espHomeStyles`` /
 * ``fullscreenMobileDialog``), then add the per-dialog bits — ``--width``,
 * body padding, banners — alongside it. The back button is a plain
 * ``<button class="back-button" slot="header-prefix">`` in the consumer's
 * own light DOM, so this ``.back-button`` rule styles it directly.
 */
export const primaryHeaderDialogStyles = css`
  esphome-base-dialog::part(header) {
    background: var(--esphome-primary);
    /* Right padding is 0 so the close button sits flush with the
       dialog's corner — the button is explicitly sized to a 40x40
       square below to give the X a comfortable hit target right
       where the user reaches for it. */
    padding: 0 0 0 var(--wa-space-m);
    height: 40px;
    box-sizing: border-box;
  }

  /* Title text lives in base-dialog's title-text span; colour/weight
     cascade in from the forwarded title part. */
  esphome-base-dialog::part(title) {
    color: var(--esphome-on-primary);
    font-size: var(--wa-font-size-s);
    font-weight: var(--wa-font-weight-bold);
  }

  esphome-base-dialog::part(close-button__base) {
    background: transparent;
    border: none;
    box-shadow: none;
    /* Square 40x40 button matching the header height so the X has a
       comfortable click/tap target instead of just the icon's
       ~14px footprint. */
    padding: 0;
    width: 40px;
    height: 40px;
    min-width: unset;
    min-height: unset;
    color: var(--esphome-on-primary);
    cursor: pointer;
  }

  .back-button {
    display: inline-flex;
    align-items: center;
    border: none;
    background: none;
    padding: 2px;
    margin-right: var(--wa-space-2xs);
    color: var(--esphome-on-primary);
    cursor: pointer;
    border-radius: 4px;
    opacity: 0.85;
  }

  .back-button:hover {
    opacity: 1;
  }
`;
