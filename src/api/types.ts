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
  board_id?: string;
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

/** A board entry in the board catalog */
export interface BoardCatalogEntry {
  id: string;
  name: string;
  description: string;
  platform: string;
  board: string;
  tags: string[];
  docs_url: string;
  image_url: string | null;
  contents?: string[] | null;
}

/** Response from GET /boards/catalog */
export interface BoardCatalogResponse {
  boards: BoardCatalogEntry[];
}

/** A field definition for a component, config section, or automation */
export interface ComponentField {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "select" | "pin";
  required: boolean;
  default?: string | number | boolean | null;
  options?: string[] | null;
}

/** A platform variant of a component type */
export interface ComponentPlatform {
  id: string;
  name: string;
  description: string;
  yaml_template: string;
  fields: ComponentField[];
}

/** A component type in the component catalog */
export interface ComponentType {
  id: string;
  name: string;
  description: string;
  docs_url: string;
  icon: string;
  platforms: ComponentPlatform[];
}

/** Response from GET /components/catalog */
export interface ComponentCatalogResponse {
  components: ComponentType[];
}

/** An automation trigger */
export interface AutomationTrigger {
  id: string;
  name: string;
  description: string;
  applicable_to: string[];
  fields: ComponentField[];
}

/** An automation action */
export interface AutomationAction {
  id: string;
  name: string;
  description: string;
  fields: ComponentField[];
}

/** Response from GET /automations/catalog */
export interface AutomationCatalogResponse {
  triggers: AutomationTrigger[];
  actions: AutomationAction[];
}

/** A config section template */
export interface ConfigSection {
  id: string;
  name: string;
  description: string;
  docs_url: string;
  icon: string;
  yaml_template: string;
  fields: ComponentField[];
}

/** Response from GET /config/catalog */
export interface ConfigCatalogResponse {
  sections: ConfigSection[];
}

/** Response from POST /devices/{config}/components */
export interface AddComponentResponse {
  yaml: string;
}

/** Response from POST /devices/{config}/config-sections */
export interface AddConfigSectionResponse {
  yaml: string;
}

/** Response from POST /devices/{config}/automations */
export interface AddAutomationResponse {
  yaml: string;
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
  board_id?: string;
}

/** Response from POST /wizard */
export interface WizardResponse {
  configuration: string;
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
