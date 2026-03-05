import { consume } from "@lit/context";
import { mdiChevronDown, mdiChevronRight, mdiChevronUp } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { LocalizeFunc } from "../../common/localize.js";
import { localizeContext } from "../../context/index.js";
import { espHomeStyles } from "../../styles/shared.js";
import { registerMdiIcons } from "../../util/register-icons.js";
import {
  parseYamlTopLevelSections,
  type YamlSection,
} from "../../util/yaml-sections.js";
import type { HighlightRange } from "../yaml-editor.js";

import "@home-assistant/webawesome/dist/components/icon/icon.js";

registerMdiIcons({
  "chevron-down": mdiChevronDown,
  "chevron-up": mdiChevronUp,
  "chevron-right": mdiChevronRight,
});

@customElement("esphome-device-navigator")
export class ESPHomeDeviceNavigator extends LitElement {
  @consume({ context: localizeContext, subscribe: true })
  @state()
  private _localize: LocalizeFunc = (key) => key;

  @property({ attribute: false })
  openSections: Set<number> = new Set();

  @property({ attribute: false })
  yaml = "";

  @state()
  private _selectedKey: string | null = null;

  @state()
  private _selectedRange: HighlightRange | null = null;

  @state()
  private _hoveredKey: string | null = null;

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
        flex-shrink: 0;
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
        overflow-y: auto;
      }

      .italic {
        font-style: italic;
        font-size: var(--wa-font-size-2xs);
        padding: 0 var(--wa-space-m);
        margin: var(--wa-space-xs) 0;
        flex-shrink: 0;
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

      .nav-items {
        display: flex;
        flex-direction: column;
        gap: var(--wa-space-2xs);
        padding: var(--wa-space-xs) var(--wa-space-m);
      }

      .nav-item {
        padding: 0 var(--wa-space-2xs);
        border: var(--wa-border-width-s) solid var(--wa-color-surface-lowered);
        border-radius: var(--wa-border-radius-m);
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        user-select: none;
        transition: background 0.1s, border-color 0.1s;
      }

      .nav-item:hover,
      .nav-item--hovered {
        background: var(--esphome-primary-light);
        border-color: var(--esphome-primary);
      }

      .nav-item--selected {
        background: var(--esphome-primary-light);
        border-color: var(--esphome-primary);
      }

      .nav-item p {
        margin: var(--wa-space-xs) 0;
        font-size: var(--wa-font-size-s);
        font-weight: var(--wa-font-weight-bold);
      }

      .nav-item wa-icon {
        font-size: var(--wa-font-size-xl);
        color: var(--esphome-primary);
      }
    `,
  ];

  protected render() {
    const yamlSections = parseYamlTopLevelSections(this.yaml);

    const sections = [
      {
        label: this._localize("device.section_core"),
        desc: this._localize("device.section_core_desc"),
        items: yamlSections,
      },
      {
        label: this._localize("device.section_components"),
        desc: this._localize("device.section_components_desc"),
        items: [] as YamlSection[],
      },
      {
        label: this._localize("device.section_automations"),
        desc: this._localize("device.section_automations_desc"),
        items: [] as YamlSection[],
      },
    ];

    return html`
      <section class="card">
        <header class="card-header">
          <h2 class="card-title">${this._localize("device.navigator_title")}</h2>
        </header>
        <div class="card-body">
          <p class="italic">${this._localize("device.navigator_desc")}</p>
          <div class="separator"></div>
          ${sections.map(({ label, desc, items }, i) => {
            const open = this.openSections.has(i);
            return html`
              <div class="nav-content" @click=${() => this._toggleSection(i)}>
                <p>${label}</p>
                <wa-icon
                  library="mdi"
                  name=${open ? "chevron-up" : "chevron-down"}
                ></wa-icon>
              </div>
              ${open
                ? html`
                    <div class="separator"></div>
                    <p class="italic">${desc}</p>
                    ${items.length > 0
                      ? html`
                          <div class="nav-items">
                            ${items.map(
                              ({ key, fromLine, toLine }) => html`
                                <div
                                  class="nav-item ${this._selectedKey === key
                                    ? "nav-item--selected"
                                    : ""} ${this._hoveredKey === key
                                    ? "nav-item--hovered"
                                    : ""}"
                                  @mouseenter=${() =>
                                    this._onItemHover(key, fromLine, toLine)}
                                  @mouseleave=${() => this._onItemLeave()}
                                  @click=${() =>
                                    this._onItemClick(key, fromLine, toLine)}
                                >
                                  <p>${key}</p>
                                  <wa-icon
                                    library="mdi"
                                    name="chevron-right"
                                  ></wa-icon>
                                </div>
                              `
                            )}
                          </div>
                        `
                      : nothing}
                  `
                : nothing}
              <div class="separator"></div>
            `;
          })}
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

  private _onItemHover(key: string, fromLine: number, toLine: number) {
    this._hoveredKey = key;
    this._emitHighlight({ fromLine, toLine });
  }

  private _onItemLeave() {
    this._hoveredKey = null;
    this._emitHighlight(this._selectedRange);
  }

  private _onItemClick(key: string, fromLine: number, toLine: number) {
    if (this._selectedKey === key) {
      this._selectedKey = null;
      this._selectedRange = null;
      // Emit hovered range if still hovering (mouse didn't leave)
      this._emitHighlight(
        this._hoveredKey === key ? { fromLine, toLine } : null
      );
    } else {
      this._selectedKey = key;
      this._selectedRange = { fromLine, toLine };
      this._emitHighlight({ fromLine, toLine });
    }
  }

  private _emitHighlight(range: HighlightRange | null) {
    this.dispatchEvent(
      new CustomEvent("yaml-highlight", {
        detail: range,
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
