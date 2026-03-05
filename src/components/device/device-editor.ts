import { consume } from "@lit/context";
import { mdiDockLeft, mdiDockRight, mdiViewSplitHorizontal } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { LocalizeFunc } from "../../common/localize.js";
import { localizeContext } from "../../context/index.js";
import { espHomeStyles } from "../../styles/shared.js";
import { registerMdiIcons } from "../../util/register-icons.js";

import "@home-assistant/webawesome/dist/components/icon/icon.js";
import "../yaml-editor.js";

registerMdiIcons({
  "layout-left": mdiDockLeft,
  "layout-right": mdiDockRight,
  "layout-split": mdiViewSplitHorizontal,
});

export type DeviceLayoutMode = "both" | "left" | "right";

@customElement("esphome-device-editor")
export class ESPHomeDeviceEditor extends LitElement {
  @consume({ context: localizeContext, subscribe: true })
  @state()
  private _localize: LocalizeFunc = (key) => key;

  @property()
  yaml = "";

  @property()
  layout: DeviceLayoutMode = "both";

  @property()
  deviceTitle = "";

  static styles = [
    espHomeStyles,
    css`
      :host {
        display: contents;
      }

      .card {
        background: var(--wa-color-surface-default);
        border-radius: var(--wa-border-radius-l);
        border: var(--wa-border-width-s) solid var(--wa-color-surface-lowered);
        box-shadow: var(--wa-elevation-02);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--wa-space-s) var(--wa-space-m);
        background: var(--esphome-primary);
        color: var(--esphome-on-primary);
      }

      .editor-header-main {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .editor-header-title {
        margin: 0;
        font-size: var(--wa-font-size-s);
        font-weight: var(--wa-font-weight-bold);
      }

      .layout-toggle {
        display: inline-flex;
        align-items: center;
        gap: 2px;
      }

      .layout-toggle button {
        border: none;
        background: transparent;
        color: var(--esphome-on-primary);
        padding: 2px 4px;
        border-radius: 4px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .layout-toggle button[aria-pressed="true"] {
        background: color-mix(in srgb, var(--esphome-on-primary), transparent 85%);
      }

      .layout-toggle wa-icon {
        font-size: 18px;
      }

      .card-body {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .editor-layout {
        flex: 1;
        min-height: 0;
        display: grid;
        gap: 0;
      }

      .editor-layout--both {
        grid-template-columns: 1fr 1px 1fr;
      }

      .editor-layout--left {
        grid-template-columns: 1fr;
      }

      .editor-layout--right {
        grid-template-columns: 1fr;
      }

      .editor-pane {
        padding: var(--wa-space-m);
        display: flex;
        flex-direction: column;
        gap: var(--wa-space-s);
        min-height: 0;
        overflow: hidden;
      }

      .editor-pane-title {
        margin: 0;
        font-size: var(--wa-font-size-s);
        font-weight: var(--wa-font-weight-bold);
      }

      .editor-pane-body {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      .pane-divider {
        background: var(--wa-color-surface-lowered);
        width: 1px;
        align-self: stretch;
      }

      .editor-layout--left .editor-pane--right,
      .editor-layout--right .editor-pane--left {
        display: none;
      }
    `,
  ];

  protected render() {
    const layoutClass =
      this.layout === "both"
        ? "editor-layout--both"
        : this.layout === "left"
          ? "editor-layout--left"
          : "editor-layout--right";

    return html`
      <section class="card">
        <header class="card-header">
          <div class="editor-header-main">
            <h2 class="editor-header-title">
              ${this._localize("device.editor_title", { name: this.deviceTitle })}
            </h2>
          </div>
          <div class="layout-toggle" aria-label="Editor layout">
            <button
              type="button"
              aria-pressed=${this.layout === "left"}
              @click=${() => this._setLayout("left")}
              title=${this._localize("device.layout_components_only")}
            >
              <wa-icon library="mdi" name="layout-left"></wa-icon>
            </button>
            <button
              type="button"
              aria-pressed=${this.layout === "both"}
              @click=${() => this._setLayout("both")}
              title=${this._localize("device.layout_split")}
            >
              <wa-icon library="mdi" name="layout-split"></wa-icon>
            </button>
            <button
              type="button"
              aria-pressed=${this.layout === "right"}
              @click=${() => this._setLayout("right")}
              title=${this._localize("device.layout_yaml_only")}
            >
              <wa-icon library="mdi" name="layout-right"></wa-icon>
            </button>
          </div>
        </header>
        <div class="card-body">
          <div class=${`editor-layout ${layoutClass}`}>
            <div class="editor-pane editor-pane--left">
              <h3 class="editor-pane-title">${this.deviceTitle}</h3>
              <div class="editor-pane-body"></div>
            </div>
            ${this.layout === "both"
              ? html`<div class="pane-divider"></div>`
              : nothing}
            <div class="editor-pane editor-pane--right">
              <h3 class="editor-pane-title">${this._localize("device.yaml_editor")}</h3>
              <div class="editor-pane-body">
                <esphome-yaml-editor
                  .value=${this.yaml}
                  @yaml-change=${this._onYamlChange}
                ></esphome-yaml-editor>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  private _setLayout(layout: DeviceLayoutMode) {
    this.dispatchEvent(
      new CustomEvent("layout-change", {
        detail: layout,
        bubbles: true,
        composed: true,
      })
    );
  }

  private _onYamlChange(e: CustomEvent) {
    this.dispatchEvent(
      new CustomEvent("yaml-change", {
        detail: e.detail,
        bubbles: true,
        composed: true,
      })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-device-editor": ESPHomeDeviceEditor;
  }
}
