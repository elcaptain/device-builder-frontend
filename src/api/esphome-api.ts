/**
 * ESPHome Dashboard API client.
 *
 * Provides methods for all HTTP and WebSocket endpoints
 * exposed by the ESPHome dashboard backend.
 */
import type {
  DevicesResponse,
  PingResponse,
  VersionResponse,
  SerialPort,
  DownloadItem,
  Board,
  BoardCatalogResponse,
  ComponentCatalogResponse,
  AutomationCatalogResponse,
  ConfigCatalogResponse,
  AddComponentResponse,
  AddConfigSectionResponse,
  AddAutomationResponse,
  SectionConfigResponse,
  UpdateSectionConfigResponse,
  UserPreferences,
  WizardRequest,
  WizardResponse,
  ImportRequest,
  WsSpawnMessage,
  WsEvent,
  DashboardEvent,
} from "./types.js";

export class ESPHomeAPI {
  private _baseUrl: string;

  constructor(baseUrl: string = "") {
    // Default to same origin (empty string) for proxied dev setup
    this._baseUrl = baseUrl;
  }

  // ─── HTTP Endpoints ────────────────────────────────────────

  private async _request<T>(
    method: string,
    path: string,
    options?: {
      params?: Record<string, string>;
      body?: unknown;
    }
  ): Promise<T> {
    let url = `${this._baseUrl}/${path}`;

    if (options?.params) {
      const search = new URLSearchParams(options.params);
      url += `?${search.toString()}`;
    }

    const init: RequestInit = { method };

    if (options?.body) {
      init.headers = { "Content-Type": "application/json" };
      init.body = JSON.stringify(options.body);
    }

    const resp = await fetch(url, init);

    if (!resp.ok) {
      throw new Error(`API request failed: ${resp.status} ${resp.statusText}`);
    }

    const contentType = resp.headers.get("content-type") ?? "";
    if (!contentType.includes("json") && resp.status === 204) return undefined as T;
    const text = await resp.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }

  /** Get all configured and importable devices. */
  async getDevices(): Promise<DevicesResponse> {
    return this._request("GET", "devices");
  }

  /** Get online/offline status for all devices. */
  async getPing(): Promise<PingResponse> {
    return this._request("GET", "ping");
  }

  /** Get ESPHome version. */
  async getVersion(): Promise<VersionResponse> {
    return this._request("GET", "version");
  }

  /** Get storage info for a device. */
  async getInfo(configuration: string): Promise<unknown> {
    return this._request("GET", "info", {
      params: { configuration },
    });
  }

  /** Get fully resolved JSON config for a device. */
  async getJsonConfig(configuration: string): Promise<unknown> {
    return this._request("GET", "json-config", {
      params: { configuration },
    });
  }

  /** Get the YAML source for a device. */
  async getEdit(configuration: string): Promise<string> {
    const url = `${this._baseUrl}/edit?configuration=${encodeURIComponent(configuration)}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Failed to load config: ${resp.status}`);
    }
    return resp.text();
  }

  /** Save the YAML source for a device. */
  async saveEdit(configuration: string, content: string): Promise<void> {
    const url = `${this._baseUrl}/edit?configuration=${encodeURIComponent(configuration)}`;
    const resp = await fetch(url, {
      method: "POST",
      body: content,
    });
    if (!resp.ok) {
      throw new Error(`Failed to save config: ${resp.status}`);
    }
  }

  /** Get available serial ports. */
  async getSerialPorts(): Promise<SerialPort[]> {
    return this._request("GET", "serial-ports");
  }

  /** Get available download files for a compiled configuration. */
  async getDownloads(configuration: string): Promise<DownloadItem[]> {
    return this._request("GET", "downloads", {
      params: { configuration },
    });
  }

  /** Get download URL for a firmware binary. */
  getDownloadUrl(configuration: string, file: string): string {
    return `${this._baseUrl}/download.bin?configuration=${encodeURIComponent(configuration)}&file=${encodeURIComponent(file)}`;
  }

  /** Get boards for a platform. */
  async getBoards(platform: string): Promise<Board[]> {
    return this._request("GET", `boards/${platform}`);
  }

  /** Get the full board catalog. */
  async getBoardCatalog(): Promise<BoardCatalogResponse> {
    return this._request("GET", "boards/catalog");
  }

  /** Get the component catalog. */
  async getComponentCatalog(): Promise<ComponentCatalogResponse> {
    return this._request("GET", "components/catalog");
  }

  /** Get the automation catalog. */
  async getAutomationCatalog(): Promise<AutomationCatalogResponse> {
    return this._request("GET", "automations/catalog");
  }

  /** Get the config section catalog. */
  async getConfigCatalog(): Promise<ConfigCatalogResponse> {
    return this._request("GET", "config/catalog");
  }

  /** Add a component to a device config. */
  async addComponent(
    configuration: string,
    data: { component: string; platform: string; fields: Record<string, unknown> }
  ): Promise<AddComponentResponse> {
    return this._request("POST", `devices/${configuration}/components`, { body: data });
  }

  /** Add a config section to a device config. */
  async addConfigSection(
    configuration: string,
    data: { section: string; fields: Record<string, unknown> }
  ): Promise<AddConfigSectionResponse> {
    return this._request("POST", `devices/${configuration}/config-sections`, { body: data });
  }

  /** Add an automation to a device config. */
  async addAutomation(
    configuration: string,
    data: {
      target_component_name: string;
      trigger: string;
      actions: Array<{ action: string; fields: Record<string, unknown> }>;
    }
  ): Promise<AddAutomationResponse> {
    return this._request("POST", `devices/${configuration}/automations`, { body: data });
  }

  /** Get config entries for a YAML section with current values. */
  async getSectionConfig(
    configuration: string,
    sectionKey: string
  ): Promise<SectionConfigResponse> {
    return this._request("GET", `devices/${configuration}/section-config`, {
      params: { key: sectionKey },
    });
  }

  /** Update config values for a YAML section. */
  async updateSectionConfig(
    configuration: string,
    data: { section_key: string; values: Record<string, unknown> }
  ): Promise<UpdateSectionConfigResponse> {
    return this._request("POST", `devices/${configuration}/section-config`, { body: data });
  }

  /** Get user preferences. */
  async getPreferences(): Promise<UserPreferences> {
    return this._request("GET", "preferences");
  }

  /** Update user preferences (partial merge). */
  async updatePreferences(prefs: UserPreferences): Promise<UserPreferences> {
    return this._request("PUT", "preferences", { body: prefs });
  }

  /** Get secret key names. */
  async getSecretKeys(): Promise<string[]> {
    return this._request("GET", "secret_keys");
  }

  /** Create a new device via the wizard. */
  async createWizard(data: WizardRequest): Promise<WizardResponse> {
    return this._request("POST", "wizard", { body: data });
  }

  /** Import/adopt a device. */
  async importDevice(data: ImportRequest): Promise<unknown> {
    return this._request("POST", "import", { body: data });
  }

  /** Delete (archive) a device. */
  async deleteDevice(configuration: string): Promise<unknown> {
    return this._request("POST", "delete", {
      params: { configuration },
    });
  }


  /** Trigger OTA update for all online devices. */
  async updateAll(): Promise<{ queued: number }> {
    return this._request("POST", "update-all");
  }

  /** Ignore/unignore a discovered device. */
  async ignoreDevice(name: string, ignore: boolean): Promise<unknown> {
    return this._request("POST", "ignore-device", {
      body: { name, ignore },
    });
  }

  // ─── WebSocket Command Streams ─────────────────────────────

  /**
   * Open a command WebSocket (compile, upload, logs, etc.)
   * and stream output lines.
   */
  streamCommand(
    path: string,
    params: WsSpawnMessage,
    callbacks: {
      onLine?: (line: string) => void;
      onExit?: (code: number) => void;
      onError?: (error: Event) => void;
    }
  ): WebSocket {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = this._baseUrl
      ? `${this._baseUrl.replace(/^http/, "ws")}/${path}`
      : `${protocol}//${window.location.host}/${path}`;

    const ws = new WebSocket(wsUrl);

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify(params));
    });

    ws.addEventListener("message", (event) => {
      const data: WsEvent = JSON.parse(event.data);
      if (data.event === "line") {
        callbacks.onLine?.(data.data);
      } else if (data.event === "exit") {
        callbacks.onExit?.(data.code);
        ws.close();
      }
    });

    ws.addEventListener("error", (event) => {
      callbacks.onError?.(event);
    });

    return ws;
  }

  /** Compile a device configuration. */
  compile(
    configuration: string,
    callbacks: {
      onLine?: (line: string) => void;
      onExit?: (code: number) => void;
      onError?: (error: Event) => void;
    }
  ): WebSocket {
    return this.streamCommand("compile", { type: "spawn", configuration }, callbacks);
  }

  /** Upload firmware to a device. */
  upload(
    configuration: string,
    port: string,
    callbacks: {
      onLine?: (line: string) => void;
      onExit?: (code: number) => void;
      onError?: (error: Event) => void;
    }
  ): WebSocket {
    return this.streamCommand(
      "upload",
      { type: "spawn", configuration, port },
      callbacks
    );
  }

  /** Stream logs from a device. */
  logs(
    configuration: string,
    port: string,
    callbacks: {
      onLine?: (line: string) => void;
      onExit?: (code: number) => void;
      onError?: (error: Event) => void;
    }
  ): WebSocket {
    return this.streamCommand("logs", { type: "spawn", configuration, port }, callbacks);
  }

  /** Validate a device configuration. */
  validate(
    configuration: string,
    callbacks: {
      onLine?: (line: string) => void;
      onExit?: (code: number) => void;
      onError?: (error: Event) => void;
    }
  ): WebSocket {
    return this.streamCommand("validate", { type: "spawn", configuration }, callbacks);
  }

  /** Rename a device. */
  rename(
    configuration: string,
    newName: string,
    callbacks: {
      onLine?: (line: string) => void;
      onExit?: (code: number) => void;
      onError?: (error: Event) => void;
    }
  ): WebSocket {
    return this.streamCommand(
      "rename",
      { type: "spawn", configuration, newName },
      callbacks
    );
  }

  /** Clean build files. */
  clean(
    configuration: string,
    callbacks: {
      onLine?: (line: string) => void;
      onExit?: (code: number) => void;
      onError?: (error: Event) => void;
    }
  ): WebSocket {
    return this.streamCommand("clean", { type: "spawn", configuration }, callbacks);
  }

  // ─── Dashboard Events WebSocket ────────────────────────────

  /**
   * Connect to the /events WebSocket for real-time dashboard updates.
   * Returns the WebSocket so the caller can close it.
   */
  connectEvents(callbacks: {
    onEvent: (event: DashboardEvent) => void;
    onError?: (error: Event) => void;
    onClose?: () => void;
  }): WebSocket {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = this._baseUrl
      ? `${this._baseUrl.replace(/^http/, "ws")}/events`
      : `${protocol}//${window.location.host}/events`;

    const ws = new WebSocket(wsUrl);

    ws.addEventListener("message", (event) => {
      const data: DashboardEvent = JSON.parse(event.data);
      callbacks.onEvent(data);
    });

    ws.addEventListener("error", (event) => {
      callbacks.onError?.(event);
    });

    ws.addEventListener("close", () => {
      callbacks.onClose?.();
    });

    // Send periodic pings to keep the connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000);

    ws.addEventListener("close", () => {
      clearInterval(pingInterval);
    });

    return ws;
  }
}
