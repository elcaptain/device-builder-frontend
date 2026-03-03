/**
 * Types for the ESPHome Dashboard API.
 * Based on https://github.com/esphome/dashboard-api
 */

/** A configured ESPHome device. */
export interface ConfiguredDevice {
  name: string;
  friendly_name?: string;
  configuration: string;
  path: string;
  comment: string | null;
  address: string;
  web_port: string | null;
  target_platform: string;
  current_version: string;
  deployed_version: string;
  loaded_integrations: string[];
}

/** An adoptable/importable ESPHome device. */
export interface AdoptableDevice {
  name: string;
  friendly_name?: string;
  network: string;
  package_import_url: string;
  project_name: string;
  project_version: string;
}

/** Response from GET /devices */
export interface DevicesResponse {
  configured: ConfiguredDevice[];
  importable: AdoptableDevice[];
}

/** Response from GET /ping */
export type PingResponse = Record<string, boolean>;

/** Response from GET /version */
export interface VersionResponse {
  version: string;
}

/** Response from GET /serial-ports */
export interface SerialPort {
  port: string;
  desc: string;
}

/** Response from GET /downloads */
export interface DownloadItem {
  title: string;
  file: string;
}

/** Response from GET /boards/:platform */
export interface Board {
  name: string;
  board: string;
}

/** Wizard request body for POST /wizard */
export interface WizardRequest {
  name: string;
  platform: string;
  board: string;
  ssid: string;
  psk: string;
  password: string;
  type: "basic" | "upload" | "empty";
  file_content?: string;
}

/** Import request body for POST /import */
export interface ImportRequest {
  name: string;
  project_name: string;
  package_import_url: string;
  friendly_name?: string;
  encryption?: string;
}

/** WebSocket command message */
export interface WsSpawnMessage {
  type: "spawn";
  configuration?: string;
  port?: string;
  only_generate?: boolean;
  newName?: string;
  clean_build_dir?: boolean;
}

/** WebSocket stdin message */
export interface WsStdinMessage {
  type: "stdin";
  data: string;
}

/** WebSocket event message from server */
export interface WsLineEvent {
  event: "line";
  data: string;
}

export interface WsExitEvent {
  event: "exit";
  code: number;
}

export type WsEvent = WsLineEvent | WsExitEvent;

/** Dashboard event types from /events WebSocket */
export type DashboardEventType =
  | "initial_state"
  | "entry_state_changed"
  | "entry_added"
  | "entry_removed"
  | "entry_updated"
  | "importable_device_added"
  | "importable_device_removed"
  | "pong";

export interface DashboardInitialStateEvent {
  event: "initial_state";
  data: {
    devices: ConfiguredDevice[];
    ping: Record<string, boolean>;
  };
}

export interface DashboardEntryStateChangedEvent {
  event: "entry_state_changed";
  data: {
    filename: string;
    name: string;
    state: boolean;
  };
}

export interface DashboardEntryEvent {
  event: "entry_added" | "entry_removed" | "entry_updated";
  data: ConfiguredDevice;
}

export interface DashboardImportableEvent {
  event: "importable_device_added" | "importable_device_removed";
  data: AdoptableDevice;
}

export interface DashboardPongEvent {
  event: "pong";
}

export type DashboardEvent =
  | DashboardInitialStateEvent
  | DashboardEntryStateChangedEvent
  | DashboardEntryEvent
  | DashboardImportableEvent
  | DashboardPongEvent;
