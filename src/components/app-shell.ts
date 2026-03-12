/**
 * Main application shell.
 *
 * - Provides Lit context for API, devices, state, and dark mode to all children
 * - Sets up the @lit-labs/router for page navigation
 * - Connects to the /events WebSocket for real-time updates
 * - Auto-detects dark mode from system preference
 */
import toast from "sonner-js";
import { Router } from "@lit-labs/router";
import { provide } from "@lit/context";
import { css, html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { ESPHomeAPI } from "../api/index.js";
import type { AdoptableDevice, ConfiguredDevice, DashboardEvent } from "../api/types.js";
import { defaultLocalize, loadLocalize, type LocalizeFunc } from "../common/localize.js";
import {
  apiContext,
  darkModeContext,
  devicesContext,
  deviceStatesContext,
  importableDevicesContext,
  localizeContext,
  versionContext,
} from "../context/index.js";
import { espHomeStyles } from "../styles/shared.js";

// Import child components
import "../pages/dashboard.js";
import "./wizard/esphome-layout.js";

@customElement("esphome-app")
export class ESPHomeApp extends LitElement {
  // ─── Context Providers ───────────────────────────────────

  @provide({ context: apiContext })
  private _api = new ESPHomeAPI();

  @provide({ context: devicesContext })
  @state()
  private _devices: ConfiguredDevice[] = [];

  @provide({ context: deviceStatesContext })
  @state()
  private _deviceStates: Record<string, boolean> = {};

  @provide({ context: importableDevicesContext })
  @state()
  private _importableDevices: AdoptableDevice[] = [];

  @provide({ context: versionContext })
  @state()
  private _version = "";

  @provide({ context: darkModeContext })
  @state()
  private _darkMode = false;

  @provide({ context: localizeContext })
  @state()
  private _localize: LocalizeFunc = defaultLocalize;

  // ─── Router ──────────────────────────────────────────────

  private _router = new Router(this, [
    {
      path: "/",
      render: () => html`<esphome-page-dashboard></esphome-page-dashboard>`,
    },
    {
      path: "/device/:id",
      enter: async () => {
        await import("../pages/device.js");
        return true;
      },
      render: ({ id }) =>
        html`<esphome-page-device .id=${id ?? ""}></esphome-page-device>`,
    },
  ]);

  // ─── State ───────────────────────────────────────────────

  private _eventsWs: WebSocket | null = null;

  static styles = [
    espHomeStyles,
    css`
      :host {
        display: block;
        height: 100vh;
        width: 100vw;
        overflow-y: auto;
        background: var(--wa-color-surface-default, #f8f9fa);
      }
    `,
  ];

  // ─── Lifecycle ───────────────────────────────────────────

  connectedCallback() {
    super.connectedCallback();
    this._init();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._eventsWs?.close();
  }

  private _initDarkMode() {
    this._darkMode = false;
    this._applyDarkMode();
  }

  private _applyDarkMode() {
    document.documentElement.classList.toggle("wa-dark", this._darkMode);
    document.documentElement.classList.toggle("wa-light", !this._darkMode);
  }

  private async _init() {
    toast.config({ toastOptions: { position: "bottom-right", richColors: true, duration: 4000 } });
    this._initDarkMode();
    try {
      this._localize = await loadLocalize();
    } catch (err) {
      console.error("Failed to load localization, falling back to default:", err);
      this._localize = ((key: string, ..._args: unknown[]) => key) as LocalizeFunc;
    }
    // Fetch version
    try {
      const { version } = await this._api.getVersion();
      this._version = version;
    } catch (err) {
      console.error("Failed to fetch ESPHome version:", err);
    }

    // Connect to real-time events
    this._connectEvents();
  }

  // ─── Events WebSocket ────────────────────────────────────

  private _connectEvents() {
    this._eventsWs = this._api.connectEvents({
      onEvent: (event: DashboardEvent) => {
        this._handleDashboardEvent(event);
      },
      onError: (err) => {
        console.error("Events WebSocket error:", err);
      },
      onClose: () => {
        // Reconnect after a delay
        setTimeout(() => this._connectEvents(), 5000);
      },
    });
  }

  private _handleDashboardEvent(event: DashboardEvent) {
    switch (event.event) {
      case "initial_state":
        this._devices = [...event.data.devices];
        this._deviceStates = { ...event.data.ping };
        break;

      case "entry_state_changed":
        this._deviceStates = {
          ...this._deviceStates,
          [event.data.filename]: event.data.state,
        };
        break;

      case "entry_added":
        this._devices = [...this._devices, event.data];
        break;

      case "entry_removed":
        this._devices = this._devices.filter(
          (d) => d.configuration !== event.data.configuration
        );
        break;

      case "entry_updated": {
        const idx = this._devices.findIndex(
          (d) => d.configuration === event.data.configuration
        );
        if (idx >= 0) {
          const updated = [...this._devices];
          updated[idx] = event.data;
          this._devices = updated;
        }
        break;
      }

      case "importable_device_added":
        this._importableDevices = [...this._importableDevices, event.data];
        break;

      case "importable_device_removed":
        this._importableDevices = this._importableDevices.filter(
          (d) => d.name !== event.data.name
        );
        break;
    }
  }

  // ─── Render ──────────────────────────────────────────────

  protected render() {
    return html`
      <esphome-layout @toggle-dark-mode=${this._onToggleDarkMode}>
        ${this._router.outlet()}
      </esphome-layout>
    `;
  }

  private _onToggleDarkMode() {
    this._darkMode = !this._darkMode;
    this._applyDarkMode();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-app": ESPHomeApp;
  }
}
