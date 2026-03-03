/**
 * Device detail page - shows config, logs, compile/upload for a single device.
 *
 * Features:
 * - Breadcrumb navigation back to devices list
 * - Status bar with device metadata
 * - Tab-based layout: Configuration, Logs, Compile & Upload
 * - YAML editor with save/reload
 * - ANSI-rendered log output with auto-scroll
 * - WebSocket streaming for compile/upload/logs
 */
import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { consume } from "@lit/context";
import { devicesContext, deviceStatesContext, apiContext } from "../context/index.js";
import type { ConfiguredDevice } from "../api/types.js";
import type { ESPHomeAPI } from "../api/index.js";
import { espHomeStyles, layoutStyles } from "../styles/shared.js";
import { registerMdiIcons } from "../util/register-icons.js";
import {
  mdiArrowLeft,
  mdiChevronRight,
  mdiWifi,
  mdiWifiOff,
  mdiChip,
  mdiCodeBraces,
  mdiUpload,
  mdiTextBoxOutline,
  mdiContentSave,
  mdiRefresh,
  mdiPlay,
  mdiStop,
  mdiDeleteSweep,
  mdiDownload,
  mdiDelete,
} from "@mdi/js";

import "@home-assistant/webawesome/dist/components/button/button.js";
import "@home-assistant/webawesome/dist/components/card/card.js";
import "@home-assistant/webawesome/dist/components/badge/badge.js";
import "@home-assistant/webawesome/dist/components/tab-group/tab-group.js";
import "@home-assistant/webawesome/dist/components/tab/tab.js";
import "@home-assistant/webawesome/dist/components/tab-panel/tab-panel.js";
import "@home-assistant/webawesome/dist/components/spinner/spinner.js";
import "@home-assistant/webawesome/dist/components/icon/icon.js";
import "@home-assistant/webawesome/dist/components/divider/divider.js";
import "../components/ansi-log.js";

registerMdiIcons({
  "arrow-left": mdiArrowLeft,
  "chevron-right": mdiChevronRight,
  wifi: mdiWifi,
  "wifi-off": mdiWifiOff,
  chip: mdiChip,
  "code-braces": mdiCodeBraces,
  upload: mdiUpload,
  "text-box-outline": mdiTextBoxOutline,
  "content-save": mdiContentSave,
  refresh: mdiRefresh,
  play: mdiPlay,
  stop: mdiStop,
  "delete-sweep": mdiDeleteSweep,
  download: mdiDownload,
  delete: mdiDelete,
});

@customElement("esphome-page-device")
export class ESPHomePageDevice extends LitElement {
  @property({ type: String })
  configuration = "";

  @property({ type: String })
  action = "";

  @consume({ context: devicesContext, subscribe: true })
  @state()
  private _devices: ConfiguredDevice[] = [];

  @consume({ context: deviceStatesContext, subscribe: true })
  @state()
  private _deviceStates: Record<string, boolean> = {};

  @consume({ context: apiContext })
  @state()
  private _api!: ESPHomeAPI;

  @state() private _yamlContent = "";
  @state() private _logLines: string[] = [];
  @state() private _isLoading = false;
  @state() private _activeTab = "config";
  @state() private _commandRunning = false;
  @state() private _lastExitCode: number | null = null;

  private _ws: WebSocket | null = null;

  static styles = [
    espHomeStyles,
    layoutStyles,
    css`
      :host {
        display: block;
      }

      /* ─── Breadcrumb ─── */

      .breadcrumb {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-bottom: 20px;
        font-size: 0.85rem;
        color: var(--wa-color-neutral-500, #6c757d);
      }

      .breadcrumb a {
        color: var(--wa-color-neutral-500, #6c757d);
        text-decoration: none;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .breadcrumb a:hover {
        color: var(--esphome-primary);
      }

      .breadcrumb .current {
        color: var(--wa-color-neutral-900, #212529);
        font-weight: 500;
      }

      .breadcrumb wa-icon {
        font-size: 1rem;
      }

      /* ─── Page Header ─── */

      .page-header {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 24px;
      }

      .page-header h1 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 600;
        flex: 1;
        color: var(--wa-color-neutral-900, #212529);
      }

      .header-actions {
        display: flex;
        gap: 8px;
      }

      /* ─── Status Bar ─── */

      .device-status {
        display: flex;
        align-items: center;
        gap: 20px;
        margin-bottom: 24px;
        padding: 14px 20px;
        background: var(--wa-color-neutral-0, #ffffff);
        border-radius: 10px;
        border: 1px solid var(--wa-color-neutral-200, #dee2e6);
        flex-wrap: wrap;
      }

      .status-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.85rem;
        color: var(--wa-color-neutral-600, #495057);
      }

      .status-item wa-icon {
        font-size: 1rem;
        color: var(--wa-color-neutral-400, #adb5bd);
      }

      .status-item strong {
        color: var(--wa-color-neutral-900, #212529);
      }

      /* ─── Tabs ─── */

      .tab-content {
        margin-top: 16px;
      }

      .tab-actions {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
        align-items: center;
      }

      .tab-actions .spacer {
        flex: 1;
      }

      .exit-status {
        font-size: 0.8rem;
        padding: 4px 10px;
        border-radius: 4px;
        font-weight: 500;
      }

      .exit-status.success {
        background: color-mix(
          in srgb,
          var(--wa-color-success-60, #2ecc71),
          transparent 88%
        );
        color: var(--wa-color-success-60, #2ecc71);
      }

      .exit-status.failure {
        background: color-mix(
          in srgb,
          var(--wa-color-danger-60, #e74c3c),
          transparent 88%
        );
        color: var(--wa-color-danger-60, #e74c3c);
      }

      /* ─── Config Editor ─── */

      .config-editor {
        width: 100%;
        min-height: 450px;
        font-family: "SF Mono", "Fira Code", "Fira Mono", "Cascadia Code", monospace;
        font-size: 0.85rem;
        border: 1px solid var(--wa-color-neutral-300, #ced4da);
        border-radius: 8px;
        padding: 16px;
        background: var(--wa-color-neutral-0, #ffffff);
        color: var(--wa-color-neutral-900, #212529);
        resize: vertical;
        tab-size: 2;
        line-height: 1.6;
        box-sizing: border-box;
      }

      .config-editor:focus {
        outline: 2px solid var(--esphome-primary);
        outline-offset: -1px;
        border-color: var(--esphome-primary);
      }

      /* ─── Not Found ─── */

      .not-found {
        text-align: center;
        padding: 64px;
        color: var(--wa-color-neutral-500);
      }

      .not-found h2 {
        color: var(--wa-color-neutral-700, #495057);
      }

      .loading-state {
        text-align: center;
        padding: 64px;
      }
    `,
  ];

  connectedCallback() {
    super.connectedCallback();
    if (this.action) {
      this._activeTab = this.action;
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._ws?.close();
  }

  updated(changedProperties: Map<string, unknown>) {
    if (changedProperties.has("configuration") && this.configuration) {
      this._loadConfig();
    }
    if (changedProperties.has("action") && this.action) {
      this._activeTab = this.action;
      if (this.action === "logs") {
        this._startLogs();
      } else if (this.action === "compile") {
        this._startCompile();
      }
    }
  }

  private get _device(): ConfiguredDevice | undefined {
    return this._devices.find((d) => d.configuration === this.configuration);
  }

  protected render() {
    const device = this._device;

    if (!device && this._devices.length > 0) {
      return html`
        <div class="page-content not-found">
          <h2>Device not found</h2>
          <p>Configuration "${this.configuration}" was not found.</p>
          <a href="/">
            <wa-button>
              <wa-icon slot="start" library="mdi" name="arrow-left"></wa-icon>
              Back to Devices
            </wa-button>
          </a>
        </div>
      `;
    }

    if (!device) {
      return html`
        <div class="page-content loading-state">
          <wa-spinner></wa-spinner>
        </div>
      `;
    }

    const isOnline = this._deviceStates[device.configuration] ?? false;

    return html`
      <div class="page-content">
        ${this._renderBreadcrumb(device)}

        <div class="page-header">
          <h1>${device.friendly_name || device.name}</h1>
          <div class="header-actions">
            <wa-badge .variant=${isOnline ? "success" : "neutral"}>
              <wa-icon
                library="mdi"
                name=${isOnline ? "wifi" : "wifi-off"}
                slot="start"
              ></wa-icon>
              ${isOnline ? "Online" : "Offline"}
            </wa-badge>
          </div>
        </div>

        ${this._renderStatusBar(device)}

        <wa-tab-group @wa-tab-show=${this._handleTabChange}>
          <wa-tab slot="nav" panel="config" ?active=${this._activeTab === "config"}>
            <wa-icon library="mdi" name="code-braces"></wa-icon>
            Configuration
          </wa-tab>
          <wa-tab slot="nav" panel="logs" ?active=${this._activeTab === "logs"}>
            <wa-icon library="mdi" name="text-box-outline"></wa-icon>
            Logs
          </wa-tab>
          <wa-tab slot="nav" panel="compile" ?active=${this._activeTab === "compile"}>
            <wa-icon library="mdi" name="upload"></wa-icon>
            Compile & Upload
          </wa-tab>

          <wa-tab-panel name="config">
            <div class="tab-content">${this._renderConfigTab()}</div>
          </wa-tab-panel>

          <wa-tab-panel name="logs">
            <div class="tab-content">${this._renderLogsTab()}</div>
          </wa-tab-panel>

          <wa-tab-panel name="compile">
            <div class="tab-content">${this._renderCompileTab()}</div>
          </wa-tab-panel>
        </wa-tab-group>
      </div>
    `;
  }

  private _renderBreadcrumb(device: ConfiguredDevice) {
    return html`
      <div class="breadcrumb">
        <a href="/">
          <wa-icon library="mdi" name="chip"></wa-icon>
          Devices
        </a>
        <wa-icon library="mdi" name="chevron-right"></wa-icon>
        <span class="current">${device.friendly_name || device.name}</span>
      </div>
    `;
  }

  private _renderStatusBar(device: ConfiguredDevice) {
    return html`
      <div class="device-status">
        <span class="status-item">
          <wa-icon library="mdi" name="chip"></wa-icon>
          <strong>${device.target_platform}</strong>
        </span>
        <span class="status-item">
          Version <strong>${device.current_version}</strong>
        </span>
        ${device.address
          ? html`
              <span class="status-item">
                Address <strong>${device.address}</strong>
              </span>
            `
          : nothing}
        ${device.deployed_version
          ? html`
              <span class="status-item">
                Deployed <strong>${device.deployed_version}</strong>
              </span>
            `
          : nothing}
      </div>
    `;
  }

  private _renderConfigTab() {
    return html`
      <div class="tab-actions">
        <wa-button
          size="small"
          variant="brand"
          @click=${this._saveConfig}
          ?disabled=${this._isLoading}
        >
          <wa-icon slot="start" library="mdi" name="content-save"></wa-icon>
          Save
        </wa-button>
        <wa-button
          size="small"
          variant="neutral"
          @click=${this._loadConfig}
          ?disabled=${this._isLoading}
        >
          <wa-icon slot="start" library="mdi" name="refresh"></wa-icon>
          Reload
        </wa-button>
      </div>
      <textarea
        class="config-editor"
        .value=${this._yamlContent}
        @input=${this._handleConfigInput}
        spellcheck="false"
      ></textarea>
    `;
  }

  private _renderLogsTab() {
    return html`
      <div class="tab-actions">
        <wa-button
          size="small"
          variant="brand"
          @click=${this._startLogs}
          ?disabled=${this._commandRunning}
        >
          <wa-icon
            slot="start"
            library="mdi"
            name=${this._commandRunning ? "stop" : "play"}
          ></wa-icon>
          ${this._commandRunning ? "Streaming..." : "Start Logs"}
        </wa-button>
        <wa-button
          size="small"
          variant="neutral"
          @click=${this._stopCommand}
          ?disabled=${!this._commandRunning}
        >
          <wa-icon slot="start" library="mdi" name="stop"></wa-icon>
          Stop
        </wa-button>
        <wa-button size="small" variant="neutral" @click=${this._clearLogs}>
          <wa-icon slot="start" library="mdi" name="delete-sweep"></wa-icon>
          Clear
        </wa-button>
      </div>
      <esphome-ansi-log
        .lines=${this._logLines}
        placeholder='Click "Start Logs" to begin streaming device logs.'
      ></esphome-ansi-log>
    `;
  }

  private _renderCompileTab() {
    return html`
      <div class="tab-actions">
        <wa-button
          size="small"
          variant="brand"
          @click=${this._startCompile}
          ?disabled=${this._commandRunning}
        >
          <wa-icon slot="start" library="mdi" name="code-braces"></wa-icon>
          ${this._commandRunning ? "Running..." : "Compile"}
        </wa-button>
        <wa-button
          size="small"
          variant="neutral"
          @click=${this._startUpload}
          ?disabled=${this._commandRunning}
        >
          <wa-icon slot="start" library="mdi" name="upload"></wa-icon>
          Upload
        </wa-button>
        <wa-button size="small" variant="neutral" @click=${this._clearLogs}>
          <wa-icon slot="start" library="mdi" name="delete-sweep"></wa-icon>
          Clear
        </wa-button>
        <div class="spacer"></div>
        ${this._lastExitCode !== null
          ? html`<span
              class="exit-status ${this._lastExitCode === 0 ? "success" : "failure"}"
            >
              ${this._lastExitCode === 0 ? "Success" : `Failed (${this._lastExitCode})`}
            </span>`
          : nothing}
      </div>
      <esphome-ansi-log
        .lines=${this._logLines}
        placeholder='Click "Compile" or "Upload" to start.'
      ></esphome-ansi-log>
    `;
  }

  private async _loadConfig() {
    if (!this.configuration || !this._api) return;
    this._isLoading = true;
    try {
      this._yamlContent = await this._api.getEdit(this.configuration);
    } catch (err) {
      console.error("Failed to load config:", err);
    } finally {
      this._isLoading = false;
    }
  }

  private async _saveConfig() {
    if (!this.configuration || !this._api) return;
    this._isLoading = true;
    try {
      await this._api.saveEdit(this.configuration, this._yamlContent);
    } catch (err) {
      console.error("Failed to save config:", err);
    } finally {
      this._isLoading = false;
    }
  }

  private _clearLogs() {
    this._logLines = [];
    this._lastExitCode = null;
  }

  private _handleConfigInput(e: Event) {
    this._yamlContent = (e.target as HTMLTextAreaElement).value;
  }

  private _handleTabChange(e: CustomEvent) {
    this._activeTab = e.detail?.name ?? "config";
  }

  private _startLogs() {
    this._stopCommand();
    this._logLines = [];
    this._lastExitCode = null;
    this._commandRunning = true;
    this._ws = this._api.logs(this.configuration, "OTA", {
      onLine: (line) => {
        this._logLines = [...this._logLines, line];
      },
      onExit: (code) => {
        this._logLines = [
          ...this._logLines,
          `\n--- Process exited with code ${code} ---`,
        ];
        this._commandRunning = false;
        this._lastExitCode = code;
      },
      onError: () => {
        this._commandRunning = false;
      },
    });
  }

  private _startCompile() {
    this._stopCommand();
    this._logLines = [];
    this._lastExitCode = null;
    this._commandRunning = true;
    this._ws = this._api.compile(this.configuration, {
      onLine: (line) => {
        this._logLines = [...this._logLines, line];
      },
      onExit: (code) => {
        this._logLines = [
          ...this._logLines,
          `\n--- Compilation ${code === 0 ? "succeeded" : "failed"} (exit code ${code}) ---`,
        ];
        this._commandRunning = false;
        this._lastExitCode = code;
      },
      onError: () => {
        this._commandRunning = false;
      },
    });
  }

  private _startUpload() {
    this._stopCommand();
    this._logLines = [];
    this._lastExitCode = null;
    this._commandRunning = true;
    this._ws = this._api.upload(this.configuration, "OTA", {
      onLine: (line) => {
        this._logLines = [...this._logLines, line];
      },
      onExit: (code) => {
        this._logLines = [
          ...this._logLines,
          `\n--- Upload ${code === 0 ? "succeeded" : "failed"} (exit code ${code}) ---`,
        ];
        this._commandRunning = false;
        this._lastExitCode = code;
      },
      onError: () => {
        this._commandRunning = false;
      },
    });
  }

  private _stopCommand() {
    this._ws?.close();
    this._ws = null;
    this._commandRunning = false;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-page-device": ESPHomePageDevice;
  }
}
