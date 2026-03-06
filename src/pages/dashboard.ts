import { consume } from "@lit/context";
import {
  mdiClipboardTextSearchOutline,
  mdiDotsVertical,
  mdiFormatListBulleted,
  mdiLanDisconnect,
  mdiPencil,
  mdiPlus,
  mdiPlusCircleOutline,
  mdiRefresh,
  mdiWeb,
} from "@mdi/js";
import { LitElement, css, html } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { MOCK_DEVICES, type MockDevice } from "../api/mock.js";
import type { LocalizeFunc } from "../common/localize.js";
import { localizeContext } from "../context/index.js";
import { espHomeStyles } from "../styles/shared.js";
import { registerMdiIcons } from "../util/register-icons.js";

import "@home-assistant/webawesome/dist/components/button/button.js";
import "@home-assistant/webawesome/dist/components/icon/icon.js";
import "../components/wizard/create-config-dialog.js";
import type { ESPHomeCreateConfigDialog } from "../components/wizard/create-config-dialog.js";

registerMdiIcons({
  "clipboard-text-search-outline": mdiClipboardTextSearchOutline,
  plus: mdiPlus,
  "plus-circle-outline": mdiPlusCircleOutline,
  refresh: mdiRefresh,
  pencil: mdiPencil,
  "format-list-bulleted": mdiFormatListBulleted,
  "dots-vertical": mdiDotsVertical,
  "lan-disconnect": mdiLanDisconnect,
  web: mdiWeb,
});

@customElement("esphome-page-dashboard")
export class ESPHomePageDashboard extends LitElement {
  @consume({ context: localizeContext, subscribe: true })
  @state()
  private _localize: LocalizeFunc = (key) => key;

  @state()
  private _showDiscovered = false;

  @query("esphome-create-config-dialog")
  private _createDialog!: ESPHomeCreateConfigDialog;

  static styles = [
    espHomeStyles,
    css`
      :host {
        display: block;
      }

      /* ─── Discovered Banner ─── */

      @keyframes banner-slide-in {
        from {
          transform: translateY(-100%);
        }
        to {
          transform: translateY(0);
        }
      }

      .discovered-banner-wrap {
        display: flex;
        justify-content: center;
        overflow: hidden;
      }

      .discovered-banner {
        display: inline-flex;
        justify-content: space-between;
        align-items: center;
        gap: var(--wa-space-xs);
        padding: var(--wa-space-xs) var(--wa-space-l) var(--wa-space-s);
        background: var(--esphome-secondary);
        border-radius: 0 0 var(--wa-border-radius-l) var(--wa-border-radius-l);
        font-size: var(--wa-font-size-s);
        color: var(--esphome-on-primary);
        animation: banner-slide-in 1s cubic-bezier(0.4, 0, 0.2, 1) both;
      }

      .discovered-banner wa-icon {
        font-size: var(--wa-font-size-m);
        color: var(--esphome-on-primary);
        margin-right: 10px;
      }

      .discovered-banner a {
        color: var(--esphome-primary-light);
        cursor: pointer;
        text-decoration: underline;
        font-weight: var(--wa-font-weight-bold);
        font-size: var(--wa-font-size-2xs);
        margin-left: var(--wa-space-4xl);
        opacity: 0.85;
      }

      .discovered-banner a:hover {
        opacity: 1;
      }

      .discovered-banner span {
        font-weight: var(--wa-font-weight-bold);
        font-size: var(--wa-font-size-xs);
      }

      .discovered-banner-empty {
        margin-right: var(--wa-space-4xl);
      }

      /* ─── Card Grid ─── */

      .devices-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: var(--wa-space-l);
        padding: var(--wa-space-l);
      }

      /* ─── Add New Device Card ─── */

      .add-device-card {
        border: var(--wa-border-width-m) dashed var(--esphome-primary);
        border-radius: var(--wa-border-radius-l);
        padding: var(--wa-space-xl) var(--wa-space-l);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: var(--wa-space-l);
        background: color-mix(in srgb, var(--esphome-primary), transparent 95%);
        min-height: 160px;
      }

      .add-device-header {
        display: flex;
        align-items: center;
        gap: var(--wa-space-xs);
        font-size: var(--wa-font-size-m);
        font-weight: var(--wa-font-weight-bold);
        color: var(--wa-color-text-normal);
      }

      .add-device-header wa-icon {
        font-size: var(--wa-font-size-l);
        color: var(--esphome-primary);
      }

      .add-device-card .create-btn {
        min-width: 200px;
      }

      .esphome-web-link {
        display: flex;
        align-items: center;
        gap: var(--wa-space-xs);
        font-size: var(--wa-font-size-s);
        color: var(--esphome-primary);
        text-decoration: none;
        cursor: pointer;
      }

      .esphome-web-link wa-icon {
        font-size: var(--wa-font-size-m);
      }

      .esphome-web-link:hover {
        text-decoration: underline;
      }

      /* ─── Device Card ─── */

      .device-card {
        border-radius: var(--wa-border-radius-l);
        border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
        background: var(--wa-color-surface-raised);
        overflow: hidden;
        transition:
          box-shadow var(--wa-transition-normal) var(--wa-transition-easing),
          transform var(--wa-transition-normal) var(--wa-transition-easing);
      }

      .device-card:hover {
        box-shadow: var(--wa-shadow-m);
        transform: translateY(-1px);
      }

      .device-card-body {
        padding: var(--wa-space-l) var(--wa-space-m) var(--wa-space-m);
        position: relative;
      }

      .device-status {
        position: absolute;
        top: var(--wa-space-m);
        right: 14px;
        display: flex;
        align-items: center;
        gap: var(--wa-space-2xs);
        font-size: var(--wa-font-size-2xs);
        font-weight: var(--wa-font-weight-bold);
        letter-spacing: 0.01em;
      }

      .device-status.offline {
        color: var(--esphome-error);
      }

      .device-status.online {
        color: var(--esphome-success);
      }

      .device-status wa-icon {
        font-size: var(--wa-font-size-s);
      }

      .device-name {
        margin: 0 0 var(--wa-space-2xs);
        font-size: var(--wa-font-size-m);
        font-weight: var(--wa-font-weight-bold);
        color: var(--wa-color-text-normal);
        padding-right: 80px;
      }

      .device-config {
        margin: 0;
        font-size: var(--wa-font-size-xs);
        color: var(--wa-color-text-quiet);
      }

      .device-actions {
        display: flex;
        align-items: center;
        gap: var(--wa-space-xs);
        padding: 10px 14px;
        border-top: var(--wa-border-width-s) solid var(--wa-color-surface-border);
      }

      .device-actions .spacer {
        flex: 1;
      }

      .menu-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: var(--wa-space-2xs);
        border-radius: var(--wa-border-radius-circle);
        color: var(--wa-color-text-quiet);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background var(--wa-transition-normal) var(--wa-transition-easing);
      }

      .menu-btn:hover {
        background: var(--wa-color-surface-lowered);
      }

      .menu-btn wa-icon {
        font-size: var(--wa-font-size-l);
      }

      /* ─── FAB ─── */

      .fab-container {
        position: fixed;
        bottom: var(--wa-space-l);
        right: var(--wa-space-l);
        z-index: 10;
      }

      .fab-container wa-button::part(base) {
        box-shadow: var(--wa-shadow-l);
      }
    `,
  ];

  protected render() {
    return html`
      ${this._renderDiscoveredBanner()}
      <div class="devices-grid">
        ${MOCK_DEVICES.length === 0 ? this._renderAddDeviceCard() : ""}
        ${MOCK_DEVICES.map((device) => this._renderDeviceCard(device))}
      </div>
      ${this._renderFab()}
      <esphome-create-config-dialog></esphome-create-config-dialog>
    `;
  }

  private _renderDiscoveredBanner() {
    return html`
      <div class="discovered-banner-wrap">
        <div class="discovered-banner">
          <div class="discovered-banner-empty"></div>
          <div style="justify-content: center; display: flex; align-items: center">
            <wa-icon library="mdi" name="clipboard-text-search-outline"></wa-icon>
            <span>${this._localize("dashboard.discovered_count", { count: 1 })}</span>
          </div>
          <a @click=${this._toggleDiscovered}> ${this._localize("dashboard.show")} </a>
        </div>
      </div>
    `;
  }

  private _renderAddDeviceCard() {
    return html`
      <div class="add-device-card">
        <div class="add-device-header">
          <wa-icon library="mdi" name="plus-circle-outline"></wa-icon>
          ${this._localize("dashboard.add_new_device")}
        </div>
        <wa-button
          class="create-btn"
          variant="primary"
          pill
          @click=${this._openCreateDialog}
        >
          ${this._localize("dashboard.create_device")}
        </wa-button>
        <a
          class="esphome-web-link"
          href="https://web.esphome.io"
          target="_blank"
          rel="noopener"
        >
          <wa-icon library="mdi" name="web"></wa-icon>
          ${this._localize("dashboard.esphome_web")}
        </a>
      </div>
    `;
  }

  private _renderDeviceCard(device: MockDevice) {
    return html`
      <div class="device-card">
        <div class="device-card-body">
          <div class="device-status ${device.online ? "online" : "offline"}">
            <wa-icon library="mdi" name="lan-disconnect"></wa-icon>
            ${device.online
              ? this._localize("dashboard.online")
              : this._localize("dashboard.offline")}
          </div>
          <h3 class="device-name">${device.name}</h3>
          <p class="device-config">${device.configuration}</p>
        </div>
        <div class="device-actions">
          <wa-button size="small" variant="primary" pill>
            <wa-icon slot="start" library="mdi" name="refresh"></wa-icon>
            ${this._localize("dashboard.update")}
          </wa-button>
          <wa-button size="small" variant="light" pill @click=${() => this._editDevice(device)}>
            <wa-icon slot="start" library="mdi" name="pencil"></wa-icon>
            ${this._localize("dashboard.edit")}
          </wa-button>
          <wa-button size="small" variant="light" pill>
            <wa-icon slot="start" library="mdi" name="format-list-bulleted"></wa-icon>
            ${this._localize("dashboard.logs")}
          </wa-button>
          <div class="spacer"></div>
          <button class="menu-btn">
            <wa-icon library="mdi" name="dots-vertical"></wa-icon>
          </button>
        </div>
      </div>
    `;
  }

  private _renderFab() {
    return html`
      <div class="fab-container">
        <wa-button variant="primary" pill @click=${this._openCreateDialog}>
          <wa-icon slot="start" library="mdi" name="plus"></wa-icon>
          ${this._localize("dashboard.create_device")}
        </wa-button>
      </div>
    `;
  }

  private _editDevice(device: MockDevice) {
    window.history.pushState({}, "", `/device/${device.configuration}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  private _openCreateDialog() {
    this._createDialog.open();
  }

  private _toggleDiscovered() {
    this._showDiscovered = !this._showDiscovered;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-page-dashboard": ESPHomePageDashboard;
  }
}
