/**
 * Shared "Show advanced settings" switch row that gates a
 * config-entry-form's advanced fields. Used by every form host.
 */
import { html } from "lit";

import type { LocalizeFunc } from "../../common/localize.js";

import "@home-assistant/webawesome/dist/components/switch/switch.js";

export function renderAdvancedToggle(
  show: boolean,
  localize: LocalizeFunc,
  onChange: (show: boolean) => void,
  count = 0
) {
  const label =
    count > 0
      ? localize("device.show_advanced_count", { count })
      : localize("device.show_advanced");
  return html`<div class="advanced-toggle-row">
    <wa-switch
      size="small"
      .checked=${show}
      @change=${(e: Event) =>
        onChange((e.target as HTMLInputElement & { checked: boolean }).checked)}
    >
      ${label}
    </wa-switch>
  </div>`;
}
