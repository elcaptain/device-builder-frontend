import { consume } from "@lit/context";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { LocalizeFunc } from "../common/localize.js";
import type { DeviceLayoutMode } from "../components/device/device-editor.js";
import { localizeContext } from "../context/index.js";
import { espHomeStyles } from "../styles/shared.js";
import type { HighlightRange } from "../components/yaml-editor.js";

import "../components/device/device-editor.js";
import "../components/device/device-navigator.js";

@customElement("esphome-page-device")
export class ESPHomePageDevice extends LitElement {
  @consume({ context: localizeContext, subscribe: true })
  @state()
  private _localize: LocalizeFunc = (key) => key;

  @property()
  id = "";

  @state()
  private _layout: DeviceLayoutMode = "both";

  @state()
  private _openSections = new Set<number>();

  @state()
  private _highlightRange: HighlightRange | null = null;

  @state()
  private _yaml = `esphome:
  name: star-bus-display
  friendly_name: STAR Bus Display
  platformio_options:
    lib_deps:
      - https://github.com/mrfaptastic/ESP32-HUB75-MatrixPanel-DMA.git

esp32:
  board: esp32-s3-devkitc-1
  framework:
    type: arduino

logger:

api:
  encryption:
    key: "kLOwquhnuI5SrtlEDEPy9OEIc+PsyScih320WRC8Jj0="

ota:
  - platform: esphome
    password: "b55f91be82c96568dae39753d3728079"

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password
  ap:
    ssid: "STAR-Bus-Display"
`;

  static styles = [
    espHomeStyles,
    css`
      :host {
        display: block;
      }

      .page {
        box-sizing: border-box;
        padding: var(--wa-space-l);
        min-height: calc(100vh - var(--esphome-header-height));
      }

      .layout-grid {
        display: grid;
        grid-template-columns: minmax(220px, 1fr) minmax(0, 5fr);
        gap: var(--wa-space-l);
        height: calc(100vh - var(--esphome-header-height) - 2 * var(--wa-space-l));
      }

      @media (max-width: 900px) {
        .layout-grid {
          grid-template-columns: 1fr;
          height: auto;
        }
      }
    `,
  ];

  protected render() {
    const deviceTitle = this.id || this._localize("dashboard.create_device");

    return html`
      <div class="page">
        <div
          class="layout-grid"
          @section-toggle=${this._onSectionToggle}
          @layout-change=${this._onLayoutChange}
          @yaml-change=${this._onYamlChange}
          @yaml-highlight=${this._onYamlHighlight}
        >
          <esphome-device-navigator
            .openSections=${this._openSections}
            .yaml=${this._yaml}
          ></esphome-device-navigator>
          <esphome-device-editor
            .yaml=${this._yaml}
            .layout=${this._layout}
            .deviceTitle=${deviceTitle}
            .highlightRange=${this._highlightRange}
          ></esphome-device-editor>
        </div>
      </div>
    `;
  }

  private _onSectionToggle(e: CustomEvent<{ index: number }>) {
    const next = new Set(this._openSections);
    if (next.has(e.detail.index)) {
      next.delete(e.detail.index);
    } else {
      next.add(e.detail.index);
    }
    this._openSections = next;
  }

  private _onLayoutChange(e: CustomEvent<DeviceLayoutMode>) {
    this._layout = e.detail;
  }

  private _onYamlChange(e: CustomEvent<{ value: string }>) {
    this._yaml = e.detail.value;
  }

  private _onYamlHighlight(e: CustomEvent<HighlightRange | null>) {
    this._highlightRange = e.detail;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-page-device": ESPHomePageDevice;
  }
}
