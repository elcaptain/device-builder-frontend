import { consume } from "@lit/context";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { LocalizeFunc } from "../common/localize.js";
import { localizeContext } from "../context/index.js";
import { espHomeStyles } from "../styles/shared.js";
import type { DeviceLayoutMode } from "../components/device/device-editor.js";

import "../components/device/device-navigator.js";
import "../components/device/device-editor.js";

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
  private _yaml = `esphome:
  name: living-room-sensor
  friendly_name: Living Room Sensor

esp32:
  board: esp32-c6-devkitc-1
  framework:
    type: esp-idf

wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password
  ap:
    ssid: "Fallback Hotspot"
    password: "fallback123"

logger:

api:
  encryption:
    key: !secret api_key

ota:
  - platform: esphome
    password: !secret ota_password

sensor:
  - platform: dht
    pin: GPIO4
    model: DHT22
    temperature:
      name: "Room Temperature"
      unit_of_measurement: "°C"
      accuracy_decimals: 1
    humidity:
      name: "Room Humidity"
      unit_of_measurement: "%"
    update_interval: 30s

  - platform: adc
    pin: GPIO34
    name: "Battery Voltage"
    attenuation: 11db
    filters:
      - multiply: 2.0
    update_interval: 60s

binary_sensor:
  - platform: gpio
    pin:
      number: GPIO14
      mode: INPUT_PULLUP
    name: "Motion Detected"
    device_class: motion

  - platform: gpio
    pin: GPIO27
    name: "Door Contact"
    device_class: door

light:
  - platform: neopixelbus
    type: GRB
    variant: WS2812
    pin: GPIO16
    num_leds: 8
    name: "Status LEDs"
    effects:
      - pulse:
          name: "Slow Pulse"
          transition_length: 1s
          update_interval: 2s

switch:
  - platform: gpio
    pin: GPIO26
    name: "Relay"
    restore_mode: RESTORE_DEFAULT_OFF

time:
  - platform: homeassistant
    id: ha_time
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
        >
          <esphome-device-navigator
            .openSections=${this._openSections}
          ></esphome-device-navigator>
          <esphome-device-editor
            .yaml=${this._yaml}
            .layout=${this._layout}
            .deviceTitle=${deviceTitle}
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
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-page-device": ESPHomePageDevice;
  }
}
