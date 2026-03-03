/**
 * Devices page - shows all configured and importable ESPHome devices.
 *
 * Features:
 * - Search/filter bar
 * - Device cards with status indicators, platform icons, update badges
 * - Importable device cards with adopt action
 * - Empty state with call to action
 */
import { consume } from "@lit/context";
import {
  mdiArrowUp,
  mdiChip,
  mdiCodeBraces,
  mdiDownload,
  mdiMagnify,
  mdiPlus,
  mdiTextBoxOutline,
  mdiUpload,
  mdiWifi,
  mdiWifiOff,
} from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { ESPHomeAPI } from "../api/index.js";
import type { AdoptableDevice, ConfiguredDevice } from "../api/types.js";
import type { LocalizeFunc } from "../common/localize.js";
import {
  apiContext,
  devicesContext,
  deviceStatesContext,
  importableDevicesContext,
  localizeContext,
} from "../context/index.js";
import { espHomeStyles, layoutStyles } from "../styles/shared.js";
import { registerMdiIcons } from "../util/register-icons.js";

import "@home-assistant/webawesome/dist/components/badge/badge.js";
import "@home-assistant/webawesome/dist/components/button/button.js";
import "@home-assistant/webawesome/dist/components/card/card.js";
import "@home-assistant/webawesome/dist/components/divider/divider.js";
import "@home-assistant/webawesome/dist/components/icon/icon.js";
import "@home-assistant/webawesome/dist/components/input/input.js";
import "@home-assistant/webawesome/dist/components/spinner/spinner.js";

registerMdiIcons({
  magnify: mdiMagnify,
  plus: mdiPlus,
  chip: mdiChip,
  wifi: mdiWifi,
  "wifi-off": mdiWifiOff,
  "code-braces": mdiCodeBraces,
  upload: mdiUpload,
  "text-box-outline": mdiTextBoxOutline,
  "arrow-up": mdiArrowUp,
  download: mdiDownload,
});

@customElement("esphome-page-devices")
export class ESPHomePageDevices extends LitElement {
  @consume({ context: devicesContext, subscribe: true })
  @state()
  private _devices: ConfiguredDevice[] = [];

  @consume({ context: deviceStatesContext, subscribe: true })
  @state()
  private _deviceStates: Record<string, boolean> = {};

  @consume({ context: importableDevicesContext, subscribe: true })
  @state()
  private _importableDevices: AdoptableDevice[] = [];

  @consume({ context: apiContext })
  @state()
  private _api!: ESPHomeAPI;

  @consume({ context: localizeContext, subscribe: true })
  @state()
  private _localize: LocalizeFunc = (key) => key;

  @state()
  private _searchQuery = "";

  static styles = [
    espHomeStyles,
    layoutStyles,
    css`
      :host {
        display: block;
      }

      .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 24px;
        gap: 16px;
      }

      .page-header h1 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--wa-color-text-normal, #212529);
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .search-bar {
        min-width: 240px;
      }

      .device-count {
        font-size: 0.85rem;
        color: var(--wa-color-text-normal, #6c757d);
        margin-left: 8px;
        font-weight: 400;
      }

      /* ─── Device Cards ─── */

      .device-card-link {
        text-decoration: none;
        color: inherit;
        display: block;
      }

      .device-card {
        cursor: pointer;
        transition:
          box-shadow 0.2s,
          transform 0.15s;
        border: 1px solid var(--wa-color-surface-border, #dee2e6);
        overflow: hidden;
      }

      .device-card:hover {
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
        transform: translateY(-1px);
      }

      .device-card-header {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 16px 16px 12px;
      }

      .device-icon {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        border-radius: 10px;
        flex-shrink: 0;
        font-size: 1.25rem;
      }

      .device-icon.online {
        background: color-mix(
          in srgb,
          var(--wa-color-success-60, #2ecc71),
          transparent 88%
        );
        color: var(--wa-color-success-60, #2ecc71);
      }

      .device-icon.offline {
        background: var(--wa-color-surface-lowered, #f1f3f5);
        color: var(--wa-color-surface-on, #adb5bd);
      }

      .device-info {
        flex: 1;
        min-width: 0;
      }

      .device-name {
        font-weight: 600;
        font-size: 0.95rem;
        margin: 0 0 2px 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--wa-color-text-normal, #212529);
      }

      .device-comment {
        font-size: 0.8rem;
        color: var(--wa-color-text-normal, #6c757d);
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .device-badges {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-shrink: 0;
      }

      .device-meta {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 0 16px 12px;
        font-size: 0.78rem;
        color: var(--wa-color-text-normal, #6c757d);
      }

      .meta-item {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .meta-item wa-icon {
        font-size: 0.85rem;
      }

      .device-actions {
        display: flex;
        gap: 8px;
        padding: 10px 16px;
        border-top: 1px solid var(--wa-color-surface-border, #f1f3f5);
        background: var(--wa-color-surface-lowered, #fafafa);
      }

      /* ─── Section Title ─── */

      .section-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 32px 0 16px;
      }

      .section-title {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 0;
        color: var(--wa-color-text-normal, #495057);
      }

      .section-count {
        font-size: 0.8rem;
        color: var(--wa-color-text-normal, #adb5bd);
      }

      /* ─── Importable Cards ─── */

      .importable-card {
        border: 1px dashed var(--wa-color-surface-border, #ced4da);
      }

      .importable-card .device-icon {
        background: color-mix(
          in srgb,
          var(--wa-color-warning-60, #f39c12),
          transparent 88%
        );
        color: var(--wa-color-warning-60, #f39c12);
      }

      /* ─── Empty State ─── */

      .empty-state {
        text-align: center;
        padding: 64px 24px;
        color: var(--wa-color-text-quiet, #6c757d);
      }

      .empty-state > wa-icon {
        font-size: 3rem;
        color: var(--wa-color-text-quiet, #ced4da);
        margin-bottom: 16px;
      }

      .empty-state h2 {
        margin: 0 0 8px;
        font-size: 1.2rem;
        font-weight: 600;
        color: var(--wa-color-text-quiet, #495057);
      }

      .empty-state p {
        margin: 0 0 24px;
        font-size: 0.9rem;
      }

      .no-results {
        text-align: center;
        padding: 32px;
        color: var(--wa-color-text-normal, #6c757d);
        font-size: 0.9rem;
      }
    `,
  ];

  protected render() {
    const filteredDevices = this._filterDevices(this._devices);
    const filteredImportable = this._filterImportable(this._importableDevices);
    const hasDevices = this._devices.length > 0 || this._importableDevices.length > 0;

    return html`
      <div class="page-content">
        <div class="page-header">
          <h1>
            ${this._localize("devices.title")}
            ${this._devices.length > 0
              ? html`<span class="device-count">(${this._devices.length})</span>`
              : nothing}
          </h1>
          <div class="header-actions">
            ${hasDevices
              ? html`
                  <wa-input
                    class="search-bar"
                    placeholder=${this._localize("devices.search_placeholder")}
                    size="small"
                    .value=${this._searchQuery}
                    @wa-input=${this._handleSearchInput}
                  >
                    <wa-icon slot="prefix" library="mdi" name="magnify"></wa-icon>
                  </wa-input>
                `
              : nothing}
            <wa-button href="/wizard" variant="brand" size="small">
              <wa-icon slot="start" library="mdi" name="plus"></wa-icon>
              ${this._localize("devices.new_device")}
            </wa-button>
          </div>
        </div>

        ${!hasDevices ? this._renderEmptyState() : nothing}
        ${filteredDevices.length > 0
          ? html`
              <div class="card-grid">
                ${filteredDevices.map((device) => this._renderDeviceCard(device))}
              </div>
            `
          : nothing}
        ${this._searchQuery && filteredDevices.length === 0 && this._devices.length > 0
          ? html`<div class="no-results">No devices match "${this._searchQuery}"</div>`
          : nothing}
        ${filteredImportable.length > 0
          ? html`
              <div class="section-header">
                <h2 class="section-title">${this._localize("devices.discovered")}</h2>
                <span class="section-count">(${filteredImportable.length})</span>
              </div>
              <div class="card-grid">
                ${filteredImportable.map((device) => this._renderImportableCard(device))}
              </div>
            `
          : nothing}
      </div>
    `;
  }

  private _renderEmptyState() {
    return html`
      <div class="empty-state">
        <wa-icon library="mdi" name="chip"></wa-icon>
        <h2>${this._localize("devices.no_devices")}</h2>
        <p>${this._localize("devices.get_started")}</p>
        <wa-button href="/wizard" variant="brand">
          <wa-icon slot="start" library="mdi" name="plus" size=""></wa-icon>
          ${this._localize("devices.create_device")}
        </wa-button>
      </div>
    `;
  }

  private _renderDeviceCard(device: ConfiguredDevice) {
    const isOnline = this._deviceStates[device.configuration] ?? false;
    const devicePath = `/device/${device.configuration}`;
    const hasUpdate =
      device.deployed_version &&
      device.current_version &&
      device.deployed_version !== device.current_version;

    return html`
      <a class="device-card-link" href=${devicePath}>
        <wa-card class="device-card">
          <div class="device-card-header">
            <div class="device-icon ${isOnline ? "online" : "offline"}">
              <wa-icon library="mdi" name=${isOnline ? "wifi" : "wifi-off"}></wa-icon>
            </div>
            <div class="device-info">
              <p class="device-name">${device.friendly_name || device.name}</p>
              ${device.comment
                ? html`<p class="device-comment">${device.comment}</p>`
                : nothing}
            </div>
            <div class="device-badges">
              ${hasUpdate ? html`<wa-badge variant="warning">Update</wa-badge>` : nothing}
              <wa-badge .variant=${isOnline ? "success" : "neutral"}>
                ${isOnline ? "Online" : "Offline"}
              </wa-badge>
            </div>
          </div>
          <div class="device-meta">
            <span class="meta-item">
              <wa-icon library="mdi" name="chip"></wa-icon>
              ${device.target_platform}
            </span>
            <span class="meta-item">v${device.current_version}</span>
            ${device.address
              ? html`<span class="meta-item">${device.address}</span>`
              : nothing}
          </div>
          <div class="device-actions" @click=${this._stopPropagation}>
            <wa-button size="small" variant="neutral" href="${devicePath}/compile">
              <wa-icon slot="start" library="mdi" name="code-braces"></wa-icon>
              Compile
            </wa-button>
            <wa-button size="small" variant="neutral" href="${devicePath}/upload">
              <wa-icon slot="start" library="mdi" name="upload"></wa-icon>
              Upload
            </wa-button>
            <wa-button size="small" variant="neutral" href="${devicePath}/logs">
              <wa-icon slot="start" library="mdi" name="text-box-outline"></wa-icon>
              Logs
            </wa-button>
          </div>
        </wa-card>
      </a>
    `;
  }

  private _renderImportableCard(device: AdoptableDevice) {
    return html`
      <wa-card class="device-card importable-card">
        <div class="device-card-header">
          <div class="device-icon">
            <wa-icon library="mdi" name="download"></wa-icon>
          </div>
          <div class="device-info">
            <p class="device-name">${device.friendly_name || device.name}</p>
            <p class="device-comment">
              ${device.project_name} v${device.project_version}
            </p>
          </div>
          <div class="device-badges">
            <wa-badge variant="warning">Adoptable</wa-badge>
          </div>
        </div>
        <div class="device-actions">
          <wa-button
            size="small"
            variant="brand"
            data-name=${device.name}
            @click=${this._handleAdoptClick}
          >
            <wa-icon slot="start" library="mdi" name="download"></wa-icon>
            Adopt
          </wa-button>
        </div>
      </wa-card>
    `;
  }

  private _filterDevices(devices: ConfiguredDevice[]): ConfiguredDevice[] {
    if (!this._searchQuery) return devices;
    const query = this._searchQuery.toLowerCase();
    return devices.filter(
      (d) =>
        d.name.toLowerCase().includes(query) ||
        (d.friendly_name?.toLowerCase().includes(query) ?? false) ||
        (d.comment?.toLowerCase().includes(query) ?? false) ||
        d.target_platform.toLowerCase().includes(query)
    );
  }

  private _filterImportable(devices: AdoptableDevice[]): AdoptableDevice[] {
    if (!this._searchQuery) return devices;
    const query = this._searchQuery.toLowerCase();
    return devices.filter(
      (d) =>
        d.name.toLowerCase().includes(query) ||
        (d.friendly_name?.toLowerCase().includes(query) ?? false) ||
        d.project_name.toLowerCase().includes(query)
    );
  }

  private _handleSearchInput(e: CustomEvent) {
    this._searchQuery = (e.target as HTMLInputElement).value;
  }

  private _stopPropagation(e: Event) {
    e.stopPropagation();
  }

  private _handleAdoptClick(e: Event) {
    const name = (e.currentTarget as HTMLElement).dataset.name!;
    console.log("Adopt device:", name);
    // TODO: Open adopt dialog
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-page-devices": ESPHomePageDevices;
  }
}
