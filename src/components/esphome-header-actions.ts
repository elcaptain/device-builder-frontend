import { consume } from "@lit/context";
import { mdiKeyVariant, mdiUpdate, mdiWeatherNight, mdiWeatherSunny } from "@mdi/js";
import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import toast from "sonner-js";
import type { ESPHomeAPI } from "../api/index.js";
import type { LocalizeFunc } from "../common/localize.js";
import { apiContext, darkModeContext, localizeContext } from "../context/index.js";
import { espHomeStyles } from "../styles/shared.js";
import { registerMdiIcons } from "../util/register-icons.js";

import "@home-assistant/webawesome/dist/components/dialog/dialog.js";
import "@home-assistant/webawesome/dist/components/icon/icon.js";

registerMdiIcons({
  "weather-sunny": mdiWeatherSunny,
  "weather-night": mdiWeatherNight,
  "key-variant": mdiKeyVariant,
  update: mdiUpdate,
});

@customElement("esphome-header-actions")
export class ESPHomeHeaderActions extends LitElement {
  @consume({ context: localizeContext, subscribe: true })
  @state()
  private _localize: LocalizeFunc = (key) => key;

  @consume({ context: darkModeContext, subscribe: true })
  @state()
  private _darkMode = false;

  @consume({ context: apiContext })
  private _api!: ESPHomeAPI;

  @state()
  private _confirmUpdateOpen = false;

  @state()
  private _updating = false;

  @state()
  private _path = window.location.pathname;

  private _onPopState = () => {
    this._path = window.location.pathname;
  };

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("popstate", this._onPopState);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("popstate", this._onPopState);
  }

  static styles = [
    espHomeStyles,
    css`
      :host {
        display: contents;
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .hdr-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: none;
        background: none;
        color: var(--esphome-on-primary);
        cursor: pointer;
        padding: 6px 10px;
        border-radius: var(--wa-border-radius-m);
        opacity: 0.85;
        font-size: var(--wa-font-size-xs);
        font-weight: var(--wa-font-weight-bold);
        font-family: inherit;
        white-space: nowrap;
        transition:
          opacity 0.12s,
          background 0.12s;
      }

      .hdr-btn:hover {
        opacity: 1;
        background: color-mix(in srgb, var(--esphome-on-primary), transparent 85%);
      }

      .hdr-btn wa-icon {
        font-size: 18px;
      }

      .hdr-btn--icon-only {
        padding: 6px;
      }

      .header-actions-separator {
        width: 1px;
        height: 20px;
        background: color-mix(in srgb, var(--esphome-on-primary), transparent 70%);
        flex-shrink: 0;
        margin: 0 4px;
      }

      /* ─── Update all dialog ─── */

      wa-dialog {
        --width: 400px;
      }

      wa-dialog::part(header) {
        background: var(--esphome-primary);
        padding: 0 var(--wa-space-m);
        height: 40px;
        box-sizing: border-box;
      }

      wa-dialog::part(title) {
        color: var(--esphome-on-primary);
        font-size: var(--wa-font-size-s);
        font-weight: var(--wa-font-weight-bold);
      }

      wa-dialog::part(close-button__base) {
        background: transparent;
        border: none;
        box-shadow: none;
        padding: 0;
        min-width: unset;
        min-height: unset;
        color: var(--esphome-on-primary);
        cursor: pointer;
      }

      wa-dialog::part(body) {
        padding: var(--wa-space-l) var(--wa-space-xl);
      }

      wa-dialog::part(footer) {
        display: none;
      }

      .dialog-body {
        display: flex;
        flex-direction: column;
        gap: var(--wa-space-l);
      }

      .dialog-body p {
        margin: 0;
        font-size: var(--wa-font-size-s);
        color: var(--wa-color-text-quiet);
        line-height: 1.5;
      }

      .dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--wa-space-s);
      }
    `,
  ];

  protected render() {
    return html`
      <div class="header-actions">
        <button
          class="hdr-btn"
          @click=${this._openSecrets}
          title=${this._localize("layout.secrets")}
        >
          <wa-icon library="mdi" name="key-variant"></wa-icon>
          ${this._localize("layout.secrets")}
        </button>
        ${this._path === "/"
          ? html`
              <button
                class="hdr-btn"
                @click=${this._openConfirmUpdate}
                title=${this._localize("layout.update_all")}
              >
                <wa-icon library="mdi" name="update"></wa-icon>
                ${this._localize("layout.update_all")}
              </button>
            `
          : ""}
        <div class="header-actions-separator"></div>
        <button
          class="hdr-btn hdr-btn--icon-only"
          @click=${this._toggleDarkMode}
          title=${this._darkMode
            ? this._localize("layout.light_mode")
            : this._localize("layout.dark_mode")}
        >
          <wa-icon
            library="mdi"
            name=${this._darkMode ? "weather-sunny" : "weather-night"}
          ></wa-icon>
        </button>
      </div>

      <wa-dialog
        label=${this._localize("layout.update_all_title")}
        ?open=${this._confirmUpdateOpen}
        @wa-after-hide=${() => {
          this._confirmUpdateOpen = false;
        }}
        light-dismiss
      >
        <div class="dialog-body">
          <p>${this._localize("layout.update_all_desc")}</p>
          <div class="dialog-actions">
            <wa-button
              variant="secondary"
              size="small"
              @click=${() => {
                this._confirmUpdateOpen = false;
              }}
            >
              ${this._localize("layout.cancel")}
            </wa-button>
            <wa-button
              variant="primary"
              size="small"
              ?disabled=${this._updating}
              @click=${this._confirmUpdateAll}
            >
              ${this._updating
                ? this._localize("layout.updating")
                : this._localize("layout.update_all_confirm")}
            </wa-button>
          </div>
        </div>
      </wa-dialog>
    `;
  }

  private _openSecrets() {
    window.history.pushState({}, "", "/secrets");
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

  private _openConfirmUpdate() {
    this._confirmUpdateOpen = true;
  }

  private async _confirmUpdateAll() {
    this._updating = true;
    try {
      const result = await this._api.updateAll();
      this._confirmUpdateOpen = false;
      toast.success(
        result.queued > 0
          ? this._localize("layout.update_all_started", { count: result.queued })
          : this._localize("layout.update_all_none"),
        { richColors: true }
      );
    } catch {
      toast.error(this._localize("layout.update_all_error"), { richColors: true });
    } finally {
      this._updating = false;
    }
  }

  private _toggleDarkMode() {
    this.dispatchEvent(
      new CustomEvent("toggle-dark-mode", { bubbles: true, composed: true })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-header-actions": ESPHomeHeaderActions;
  }
}
