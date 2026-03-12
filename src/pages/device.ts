import { consume } from "@lit/context";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { BoardCatalogEntry, ConfiguredDevice } from "../api/types.js";
import type { ESPHomeAPI } from "../api/index.js";
import type { LocalizeFunc } from "../common/localize.js";
import type { DeviceLayoutMode } from "../components/device/device-editor.js";
import type { HighlightRange } from "../components/yaml-editor.js";
import { localizeContext, devicesContext, apiContext } from "../context/index.js";
import { espHomeStyles } from "../styles/shared.js";

import "../components/device/device-editor.js";
import "../components/device/device-navigator.js";

@customElement("esphome-page-device")
export class ESPHomePageDevice extends LitElement {
  @consume({ context: localizeContext, subscribe: true })
  @state()
  private _localize: LocalizeFunc = (key) => key;

  @consume({ context: devicesContext, subscribe: true })
  @state()
  private _devices: ConfiguredDevice[] = [];

  @consume({ context: apiContext })
  private _api!: ESPHomeAPI;

  @property()
  id = "";

  @property({ type: Boolean })
  justCreated = false;

  @state()
  private _layout: DeviceLayoutMode = "both";

  @state()
  private _openSections = new Set<number>();

  private get _device(): ConfiguredDevice | null {
    return this._devices.find((d) => d.configuration === this.id) ?? null;
  }

  @state()
  private _boards: BoardCatalogEntry[] = [];

  private get _board(): BoardCatalogEntry | null {
    // Prefer explicit board_id from metadata
    const boardId = this._device?.board_id;
    if (boardId) return this._boards.find((b) => b.id === boardId) ?? null;
    // Fallback: extract `board:` value from the YAML and match by hardware board ID
    const match = this._yaml.match(/^\s{2}board:\s*(\S+)/m);
    if (match) return this._boards.find((b) => b.board === match[1]) ?? null;
    return null;
  }

  @state()
  private _highlightRange: HighlightRange | null = null;

  @state()
  private _yaml = "";

  async connectedCallback() {
    super.connectedCallback();
    this._loadBoardCatalog();
  }

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("id") && this.id) {
      this._loadYaml();
    }
  }

  private async _loadBoardCatalog() {
    try {
      const catalog = await this._api.getBoardCatalog();
      this._boards = catalog.boards;
    } catch (e) {
      console.error("Failed to load board catalog:", e);
    }
  }

  private async _loadYaml() {
    try {
      this._yaml = await this._api.getEdit(this.id);
    } catch (e) {
      console.error("Failed to load YAML:", e);
    }
  }

  private async _saveYaml() {
    try {
      await this._api.saveEdit(this.id, this._yaml);
    } catch (e) {
      console.error("Failed to save YAML:", e);
    }
  }

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
        grid-template-columns: minmax(230px, 1fr) minmax(0, 5fr);
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
    const deviceTitle =
      this._device?.friendly_name || this._device?.name || this.id || this._localize("dashboard.create_device");

    return html`
      <div class="page">
        <div
          class="layout-grid"
          @section-toggle=${this._onSectionToggle}
          @layout-change=${this._onLayoutChange}
          @yaml-change=${this._onYamlChange}
          @yaml-highlight=${this._onYamlHighlight}
          @yaml-updated=${this._onYamlUpdated}
          @save-yaml=${this._saveYaml}
        >
          <esphome-device-navigator
            .openSections=${this._openSections}
            .yaml=${this._yaml}
            .boardName=${this._board?.name ?? ""}
            .configuration=${this.id}
          ></esphome-device-navigator>
          <esphome-device-editor
            .yaml=${this._yaml}
            .layout=${this._layout}
            .deviceTitle=${deviceTitle}
            .board=${this._board}
            .justCreated=${this.justCreated}
            .highlightRange=${this._highlightRange}
            .configuration=${this.id}
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

  private _onYamlUpdated(e: CustomEvent<{ yaml: string }>) {
    this._yaml = e.detail.yaml;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-page-device": ESPHomePageDevice;
  }
}
