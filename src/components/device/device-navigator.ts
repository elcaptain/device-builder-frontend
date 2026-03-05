import { consume } from "@lit/context";
import { mdiChevronDown, mdiChevronUp } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { LocalizeFunc } from "../../common/localize.js";
import { localizeContext } from "../../context/index.js";
import { espHomeStyles } from "../../styles/shared.js";
import { registerMdiIcons } from "../../util/register-icons.js";

import "@home-assistant/webawesome/dist/components/icon/icon.js";

registerMdiIcons({
  "chevron-down": mdiChevronDown,
  "chevron-up": mdiChevronUp,
});

@customElement("esphome-device-navigator")
export class ESPHomeDeviceNavigator extends LitElement {
  @consume({ context: localizeContext, subscribe: true })
  @state()
  private _localize: LocalizeFunc = (key) => key;

  @property({ attribute: false })
  openSections: Set<number> = new Set();

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
        padding: var(--wa-space-s) var(--wa-space-m);
        background: var(--esphome-primary);
        color: var(--esphome-on-primary);
      }

      .card-title {
        margin: 0;
        font-size: var(--wa-font-size-s);
        font-weight: var(--wa-font-weight-bold);
      }

      .card-body {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .italic {
        font-style: italic;
        font-size: var(--wa-font-size-2xs);
        padding: 0 var(--wa-space-2xs);
      }

      .separator {
        height: 1px;
        background: var(--wa-color-surface-lowered);
        margin: var(--wa-space-2xs) 0;
        flex-shrink: 0;
      }

      .nav-content {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 var(--wa-space-m);
        cursor: pointer;
        user-select: none;
        flex-shrink: 0;
      }

      .nav-content:hover p {
        color: var(--esphome-primary);
      }

      .nav-content p {
        margin: var(--wa-space-xs) 0;
        font-size: var(--wa-font-size-s);
        font-weight: var(--wa-font-weight-bold);
      }

      .nav-content wa-icon {
        font-size: var(--wa-font-size-xl);
        color: var(--esphome-primary);
      }
    `,
  ];

  protected render() {
    const sections = [
      this._localize("device.section_core"),
      this._localize("device.section_components"),
      this._localize("device.section_automations"),
    ];

    return html`
      <section class="card">
        <header class="card-header">
          <h2 class="card-title">${this._localize("device.navigator_title")}</h2>
        </header>
        <div class="card-body">
          <p class="italic">${this._localize("device.navigator_desc")}</p>
          ${sections.map((label, i) => {
            const open = this.openSections.has(i);
            return html`
              <div class="separator"></div>
              <div class="nav-content" @click=${() => this._toggleSection(i)}>
                <p>${label}</p>
                <wa-icon
                  library="mdi"
                  name=${open ? "chevron-up" : "chevron-down"}
                ></wa-icon>
              </div>
              ${open
                ? html`<div style="padding: var(--wa-space-l) var(--wa-space-m);">
                    ${this._localize("device.section_placeholder")}
                  </div>`
                : nothing}
            `;
          })}
          <div class="separator"></div>
        </div>
      </section>
    `;
  }

  private _toggleSection(index: number) {
    this.dispatchEvent(
      new CustomEvent("section-toggle", {
        detail: { index },
        bubbles: true,
        composed: true,
      })
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-device-navigator": ESPHomeDeviceNavigator;
  }
}
