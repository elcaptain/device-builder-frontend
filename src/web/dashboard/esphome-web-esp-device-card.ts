import { consume } from "@lit/context";
import {
  mdiLinkOff,
  mdiRocketLaunch,
  mdiTextBoxOutline,
  mdiUpload,
  mdiWifiCog,
} from "@mdi/js";
import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import type { LocalizeFunc } from "../../common/localize.js";
import { localizeContext } from "../../context/index.js";
import { actionBtnStyles } from "../../styles/action-buttons.js";
import { espHomeStyles } from "../../styles/shared.js";
import { registerMdiIcons } from "../../util/register-icons.js";
import { openImprovDialog } from "../improv/open-improv-dialog.js";
import "../install/esphome-web-install-adoptable-dialog.js";
import "../install/esphome-web-install-upload-dialog.js";
import { openPortForLogs } from "../logs/esphome-web-logs-dialog.js";
import { cardActionsRowStyles } from "./card-actions-row.js";
import "./esphome-web-card.js";

import "@home-assistant/webawesome/dist/components/icon/icon.js";

registerMdiIcons({
  "rocket-launch": mdiRocketLaunch,
  upload: mdiUpload,
  "text-box-outline": mdiTextBoxOutline,
  "wifi-cog": mdiWifiCog,
  "link-off": mdiLinkOff,
});

/**
 * The connected-ESP card: the hub for the per-device actions. Holds the
 * authorized ``SerialPort`` and hands it to each action's dialog, which owns
 * the open/close lifecycle.
 */
@customElement("esphome-web-esp-device-card")
export class ESPHomeWebEspDeviceCard extends LitElement {
  @property({ attribute: false }) port!: SerialPort;

  @consume({ context: localizeContext, subscribe: true })
  @state()
  private _localize: LocalizeFunc = (key) => key;

  @state() private _logsOpen = false;
  @state() private _uploadOpen = false;
  @state() private _adoptableOpen = false;

  private async _showLogs(): Promise<void> {
    // Open the port before showing the dialog so a connect failure surfaces a
    // toast instead of an empty terminal (the dialog streams an open port).
    if (!(await openPortForLogs(this.port, this._localize))) return;
    this._logsOpen = true;
  }

  private _showInstall(): void {
    this._uploadOpen = true;
  }

  private _showAdoptable(): void {
    this._adoptableOpen = true;
  }

  private _configureWifi(): void {
    void openImprovDialog(this.port, this._localize);
  }

  // Fired by the adoptable dialog once the basic firmware is flashed and the
  // device has reset — go straight into Wi-Fi provisioning so the device shows
  // up on the user's ESPHome Device Builder ready to adopt.
  private _onProvisionWifi(): void {
    void openImprovDialog(this.port, this._localize);
  }

  private _disconnect(): void {
    this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
  }

  protected render() {
    return html`
      <esphome-web-card status=${this._localize("web.status.connected")} variant="online">
        <span slot="header">${this._localize("web.esp.title")}</span>
        ${this._localize("web.esp.connected_hint")}
        <div class="card-actions-row" slot="actions">
          <button class="action-btn action-btn--primary" @click=${this._showAdoptable}>
            <wa-icon library="mdi" name="rocket-launch"></wa-icon>
            ${this._localize("web.actions.prepare")}
          </button>
          <button
            class="action-btn action-btn--ghost action-btn--tile"
            title=${this._localize("web.actions.install")}
            aria-label=${this._localize("web.actions.install")}
            @click=${this._showInstall}
          >
            <wa-icon library="mdi" name="upload"></wa-icon>
          </button>
          <button
            class="action-btn action-btn--ghost action-btn--tile"
            title=${this._localize("web.actions.logs")}
            aria-label=${this._localize("web.actions.logs")}
            @click=${this._showLogs}
          >
            <wa-icon library="mdi" name="text-box-outline"></wa-icon>
          </button>
          <button
            class="action-btn action-btn--ghost action-btn--tile"
            title=${this._localize("web.actions.configure_wifi")}
            aria-label=${this._localize("web.actions.configure_wifi")}
            @click=${this._configureWifi}
          >
            <wa-icon library="mdi" name="wifi-cog"></wa-icon>
          </button>
          <button
            class="action-btn action-btn--ghost action-btn--icon-only"
            title=${this._localize("web.actions.disconnect")}
            aria-label=${this._localize("web.actions.disconnect")}
            @click=${this._disconnect}
          >
            <wa-icon library="mdi" name="link-off"></wa-icon>
          </button>
        </div>
      </esphome-web-card>
      <esphome-web-install-adoptable-dialog
        .port=${this.port}
        ?open=${this._adoptableOpen}
        @provision-wifi=${this._onProvisionWifi}
        @after-hide=${() => (this._adoptableOpen = false)}
      ></esphome-web-install-adoptable-dialog>
      <esphome-web-install-upload-dialog
        .port=${this.port}
        ?open=${this._uploadOpen}
        @after-hide=${() => (this._uploadOpen = false)}
      ></esphome-web-install-upload-dialog>
      <esphome-web-logs-dialog
        .port=${this.port}
        ?open=${this._logsOpen}
        .deviceLabel=${this._localize("web.esp.title")}
        @after-hide=${() => (this._logsOpen = false)}
      ></esphome-web-logs-dialog>
    `;
  }

  static styles = [espHomeStyles, actionBtnStyles, cardActionsRowStyles];
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-web-esp-device-card": ESPHomeWebEspDeviceCard;
  }
}
