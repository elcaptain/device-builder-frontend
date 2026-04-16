import { consume } from "@lit/context";
import {
  mdiAlertCircleOutline,
  mdiBroom,
  mdiCheckboxBlankOutline,
  mdiCheckboxMarked,
  mdiCheckDecagram,
  mdiConsole,
  mdiDelete,
  mdiDotsVertical,
  mdiDownload,
  mdiFileDownloadOutline,
  mdiKeyVariant,
  mdiPencil,
  mdiRenameOutline,
  mdiUpdate,
  mdiUpload,
  mdiWifi,
  mdiWifiOff,
} from "@mdi/js";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { DeviceState } from "../api/types.js";
import type { LocalizeFunc } from "../common/localize.js";
import { localizeContext } from "../context/index.js";
import { espHomeStyles } from "../styles/shared.js";
import { registerMdiIcons } from "../util/register-icons.js";

import "@home-assistant/webawesome/dist/components/dropdown-item/dropdown-item.js";
import "@home-assistant/webawesome/dist/components/dropdown/dropdown.js";
import "@home-assistant/webawesome/dist/components/icon/icon.js";

registerMdiIcons({
  "alert-circle-outline": mdiAlertCircleOutline,
  broom: mdiBroom,
  "checkbox-blank-outline": mdiCheckboxBlankOutline,
  "checkbox-marked": mdiCheckboxMarked,
  "check-decagram": mdiCheckDecagram,
  console: mdiConsole,
  delete: mdiDelete,
  "dots-vertical": mdiDotsVertical,
  download: mdiDownload,
  "file-download-outline": mdiFileDownloadOutline,
  "key-variant": mdiKeyVariant,
  pencil: mdiPencil,
  "rename-outline": mdiRenameOutline,
  update: mdiUpdate,
  upload: mdiUpload,
  wifi: mdiWifi,
  "wifi-off": mdiWifiOff,
});

@customElement("esphome-device-card")
export class ESPHomeDeviceCard extends LitElement {
  @consume({ context: localizeContext, subscribe: true })
  @state()
  private _localize: LocalizeFunc = (key) => key;

  @property({ attribute: false })
  name = "";

  @property()
  configuration = "";

  @property()
  state: DeviceState = DeviceState.UNKNOWN;

  @property({ type: Boolean, attribute: "has-pending-changes" })
  hasPendingChanges = false;

  @property({ type: Boolean, attribute: "has-update-available" })
  hasUpdateAvailable = false;

  @property({ type: Boolean, attribute: "select-mode" })
  selectMode = false;

  @property({ type: Boolean })
  selected = false;

  static styles = [
    espHomeStyles,
    css`
      :host {
        display: block;
      }

      .device-card {
        border-radius: var(--wa-border-radius-l);
        border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
        background: var(--wa-color-surface-raised);
        overflow: visible;
        display: flex;
        flex-direction: column;
        transition: box-shadow 0.15s;
      }

      .device-card:hover {
        box-shadow: var(--wa-shadow-m);
      }

      .device-card--clickable {
        cursor: pointer;
      }

      .device-card--selectable {
        cursor: pointer;
      }

      .device-card--selected {
        border-color: var(--esphome-primary);
        background: color-mix(in srgb, var(--esphome-primary), transparent 95%);
      }

      .device-card-header {
        padding: var(--wa-space-m) var(--wa-space-m) var(--wa-space-s);
        border-bottom: var(--wa-border-width-s) solid var(--wa-color-surface-border);
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: var(--wa-space-xs);
      }

      .device-card-header:last-child {
        border-bottom: none;
      }

      .device-card-header-left {
        flex: 1;
        min-width: 0;
      }

      .device-name {
        margin: 0 0 var(--wa-space-2xs);
        font-size: var(--wa-font-size-m);
        font-weight: var(--wa-font-weight-bold);
        color: var(--wa-color-text-normal);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .device-config {
        margin: 0;
        font-size: var(--wa-font-size-xs);
        color: var(--wa-color-text-quiet);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .device-status {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 8px;
        border-radius: 999px;
        font-size: var(--wa-font-size-2xs);
        font-weight: var(--wa-font-weight-bold);
        letter-spacing: 0.02em;
        flex-shrink: 0;
        margin-top: 2px;
      }

      .device-status.offline {
        background: color-mix(in srgb, var(--esphome-error), transparent 85%);
        color: var(--esphome-error);
      }

      .device-status.online {
        background: color-mix(in srgb, var(--esphome-success), transparent 85%);
        color: var(--esphome-success);
      }

      .device-status.unknown {
        background: var(--wa-color-surface-lowered);
        color: var(--wa-color-text-quiet);
      }

      .device-status wa-icon {
        font-size: 13px;
      }

      .device-indicators {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 0 var(--wa-space-m) var(--wa-space-s);
      }

      .indicator-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: var(--wa-font-size-2xs);
        font-weight: var(--wa-font-weight-bold);
        letter-spacing: 0.02em;
      }

      .indicator-badge wa-icon {
        font-size: 12px;
      }

      .indicator-badge--modified {
        background: color-mix(in srgb, var(--esphome-warning, #f59e0b), transparent 85%);
        color: var(--esphome-warning, #d97706);
      }

      .indicator-badge--update {
        background: color-mix(in srgb, var(--esphome-primary), transparent 88%);
        color: var(--esphome-primary);
      }

      .device-checkbox {
        font-size: 22px;
        color: var(--wa-color-text-quiet);
        flex-shrink: 0;
        transition: color 0.12s;
      }

      .device-checkbox--checked {
        color: var(--esphome-primary);
      }

      /* ─── Action buttons ─── */

      .device-actions {
        display: flex;
        align-items: center;
        gap: var(--wa-space-2xs);
        padding: var(--wa-space-s) var(--wa-space-m);
      }

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
        background: color-mix(in srgb, var(--esphome-primary), black 10%);
      }

      .action-btn--accent {
        background: color-mix(in srgb, var(--esphome-primary), transparent 90%);
        color: var(--esphome-primary);
        border-color: color-mix(in srgb, var(--esphome-primary), transparent 70%);
      }

      .action-btn--accent:hover {
        background: color-mix(in srgb, var(--esphome-primary), transparent 82%);
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
      }
    `,
  ];

  protected render() {
    return html`
      <div
        class="device-card ${this.selectMode ? "device-card--selectable" : "device-card--clickable"} ${this.selectMode && this.selected ? "device-card--selected" : ""}"
        @click=${this.selectMode ? () => this._emit("toggle-select") : () => this._emit("card-click")}
      >
        <div class="device-card-header">
          ${this.selectMode
            ? html`
                <wa-icon
                  class="device-checkbox ${this.selected ? "device-checkbox--checked" : ""}"
                  library="mdi"
                  name=${this.selected ? "checkbox-marked" : "checkbox-blank-outline"}
                ></wa-icon>
              `
            : nothing}
          <div class="device-card-header-left">
            <h3 class="device-name">${this.name}</h3>
            <p class="device-config">${this.configuration}</p>
          </div>
          <div class="device-status ${this.state}">
            <wa-icon library="mdi" name=${this.state === DeviceState.ONLINE ? "wifi" : "wifi-off"}></wa-icon>
            ${this.state === DeviceState.ONLINE
              ? this._localize("dashboard.online")
              : this.state === DeviceState.OFFLINE
                ? this._localize("dashboard.offline")
                : this._localize("dashboard.unknown")}
          </div>
        </div>
        ${this._renderIndicators()}
        ${!this.selectMode
          ? html`
              <div class="device-actions" @click=${(e: Event) => e.stopPropagation()}>
                <button
                  class="action-btn action-btn--primary"
                  @click=${() => this._emit("edit-device")}
                >
                  <wa-icon library="mdi" name="pencil"></wa-icon>
                  ${this._localize("dashboard.edit")}
                </button>
                <button
                  class="action-btn action-btn--accent"
                  @click=${() => this._emit("update-device")}
                >
                  <wa-icon library="mdi" name="upload"></wa-icon>
                  ${this._localize("dashboard.update")}
                </button>
                <button
                  class="action-btn action-btn--ghost"
                  @click=${() => this._emit("open-logs")}
                >
                  <wa-icon library="mdi" name="console"></wa-icon>
                  ${this._localize("dashboard.logs")}
                </button>
                <wa-dropdown
                  placement="right-start"
                  distance="4"
                  @wa-select=${this._onDropdownSelect}
                >
                  <button
                    slot="trigger"
                    class="action-btn action-btn--ghost action-btn--icon-only"
                    aria-label=${this._localize("dashboard.more_options")}
                  >
                    <wa-icon library="mdi" name="dots-vertical"></wa-icon>
                  </button>
                  <wa-dropdown-item value="validate-device">
                    <wa-icon slot="icon" library="mdi" name="check-decagram"></wa-icon>
                    ${this._localize("dashboard.action_validate")}
                  </wa-dropdown-item>
                  <wa-dropdown-item value="install-device">
                    <wa-icon slot="icon" library="mdi" name="upload"></wa-icon>
                    ${this._localize("dashboard.action_install")}
                  </wa-dropdown-item>
                  <wa-dropdown-item value="show-api-key">
                    <wa-icon slot="icon" library="mdi" name="key-variant"></wa-icon>
                    ${this._localize("dashboard.action_show_api_key")}
                  </wa-dropdown-item>
                  <wa-dropdown-item value="download-yaml">
                    <wa-icon slot="icon" library="mdi" name="download"></wa-icon>
                    ${this._localize("dashboard.action_download_yaml")}
                  </wa-dropdown-item>
                  <wa-dropdown-item value="rename-device">
                    <wa-icon slot="icon" library="mdi" name="rename-outline"></wa-icon>
                    ${this._localize("dashboard.action_rename")}
                  </wa-dropdown-item>
                  <wa-dropdown-item value="clean-build">
                    <wa-icon slot="icon" library="mdi" name="broom"></wa-icon>
                    ${this._localize("dashboard.action_clean_build")}
                  </wa-dropdown-item>
                  <wa-dropdown-item value="download-elf">
                    <wa-icon slot="icon" library="mdi" name="file-download-outline"></wa-icon>
                    ${this._localize("dashboard.action_download_elf")}
                  </wa-dropdown-item>
                  <wa-dropdown-item value="delete-device" .variant=${"danger"}>
                    <wa-icon slot="icon" library="mdi" name="delete"></wa-icon>
                    ${this._localize("dashboard.delete")}
                  </wa-dropdown-item>
                </wa-dropdown>
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private _renderIndicators() {
    if (!this.hasPendingChanges && !this.hasUpdateAvailable) return nothing;
    return html`
      <div class="device-indicators">
        ${this.hasPendingChanges
          ? html`<span class="indicator-badge indicator-badge--modified">
              <wa-icon library="mdi" name="alert-circle-outline"></wa-icon>
              ${this._localize("dashboard.status_modified")}
            </span>`
          : nothing}
        ${this.hasUpdateAvailable
          ? html`<span class="indicator-badge indicator-badge--update">
              <wa-icon library="mdi" name="update"></wa-icon>
              ${this._localize("dashboard.status_update_available")}
            </span>`
          : nothing}
      </div>
    `;
  }

  private _onDropdownSelect(e: CustomEvent) {
    const item = e.detail?.item;
    const value = item?.value;
    if (value) this._emit(value);
  }

  private _emit(name: string) {
    this.dispatchEvent(
      new CustomEvent(name, { bubbles: true, composed: true }),
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-device-card": ESPHomeDeviceCard;
  }
}
