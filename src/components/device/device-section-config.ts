import { consume } from "@lit/context";
import {
  mdiAlertCircleOutline,
  mdiChevronDown,
  mdiChevronUp,
  mdiClose,
  mdiContentSave,
  mdiHelpCircleOutline,
  mdiOpenInNew,
  mdiPlus,
} from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import toast from "sonner-js";
import type { ESPHomeAPI } from "../../api/index.js";
import type { BoardCatalogEntry, BoardPin, ConfigEntry } from "../../api/types.js";
import { ConfigEntryType, PinFeature, PinMode } from "../../api/types.js";
import type { LocalizeFunc } from "../../common/localize.js";
import { apiContext, localizeContext } from "../../context/index.js";
import { inputStyles } from "../../styles/inputs.js";
import { espHomeStyles } from "../../styles/shared.js";
import {
  isEntryVisible,
  validateEntries,
  type ValidationError,
} from "../../util/config-validation.js";
import { registerMdiIcons } from "../../util/register-icons.js";

/**
 * Immutably set `value` at `path` inside an object, returning a new
 * object with structural sharing of untouched branches. Intermediate
 * objects are created when the path crosses missing or non-object
 * nodes (so a fresh form can write to nested fields).
 */
function _setIn(
  obj: Record<string, unknown>,
  path: string[],
  value: unknown,
): Record<string, unknown> {
  if (path.length === 0) return obj;
  const [head, ...rest] = path;
  if (rest.length === 0) return { ...obj, [head]: value };
  const child = obj[head];
  const childObj =
    child !== null && typeof child === "object" && !Array.isArray(child)
      ? (child as Record<string, unknown>)
      : {};
  return { ...obj, [head]: _setIn(childObj, rest, value) };
}

// Local type — SectionConfigResponse is not yet available in the WebSocket backend
interface SectionConfigResponse {
  section_key: string;
  section_type: "core" | "component" | "automation";
  title: string;
  description: string;
  docs_url: string;
  icon: string;
  image_url: string;
  entries: ConfigEntry[];
}

import "@home-assistant/webawesome/dist/components/divider/divider.js";
import "@home-assistant/webawesome/dist/components/icon/icon.js";
import "@home-assistant/webawesome/dist/components/option/option.js";
import "@home-assistant/webawesome/dist/components/select/select.js";
import "@home-assistant/webawesome/dist/components/spinner/spinner.js";
import "@home-assistant/webawesome/dist/components/switch/switch.js";

registerMdiIcons({
  "alert-circle-outline": mdiAlertCircleOutline,
  "chevron-down": mdiChevronDown,
  "chevron-up": mdiChevronUp,
  close: mdiClose,
  "content-save": mdiContentSave,
  "help-circle-outline": mdiHelpCircleOutline,
  "open-in-new": mdiOpenInNew,
  plus: mdiPlus,
});

@customElement("esphome-device-section-config")
export class ESPHomeDeviceSectionConfig extends LitElement {
  @consume({ context: localizeContext, subscribe: true })
  @state()
  private _localize: LocalizeFunc = (key) => key;

  @consume({ context: apiContext })
  private _api!: ESPHomeAPI;

  @property()
  configuration = "";

  @property()
  sectionKey = "";

  @property({ type: Number })
  fromLine?: number;

  /** Optional board metadata; used to render PIN selectors with proper filtering. */
  @property({ attribute: false })
  board: BoardCatalogEntry | null = null;

  @state()
  private _config: SectionConfigResponse | null = null;

  @state()
  private _values: Record<string, unknown> = {};

  @state()
  private _loading = false;

  @state()
  private _saving = false;

  @state()
  private _dirty = false;

  private _loadId = 0;

  @state()
  private _error = "";

  @state()
  private _fieldErrors: Map<string, ValidationError> = new Map();

  /** Section keys whose Advanced section is currently expanded. Tracking this
   *  per-section means switching between configs (esphome → wifi → logger)
   *  doesn't bleed one section's state into another. */
  @state()
  private _advancedOpenSections = new Set<string>();

  private get _advancedOpen(): boolean {
    return this._advancedOpenSections.has(this.sectionKey);
  }

  private _setAdvancedOpen(open: boolean) {
    const next = new Set(this._advancedOpenSections);
    if (open) {
      next.add(this.sectionKey);
    } else {
      next.delete(this.sectionKey);
    }
    this._advancedOpenSections = next;
  }

  /**
   * Top-level component keys present in the device's YAML (e.g. `wifi`,
   * `mqtt`, `api`). Used to evaluate `depends_on_component` predicates so
   * we hide entries that only matter when their parent component exists.
   */
  @state()
  private _presentComponents: Set<string> = new Set();

  /** Full YAML of the device — kept so the ID picker can scan it. */
  @state()
  private _yaml = "";

  /** Dotted-paths of nested entries currently expanded in the UI. */
  @state()
  private _nestedOpenSections: Set<string> = new Set();

  static styles = [
    espHomeStyles,
    inputStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--wa-space-m);
        margin-top: var(--wa-space-m);
      }

      .section-header {
        display: flex;
        flex-direction: row;
        align-items: center;
        width: 100%;
        gap: var(--wa-space-l);
        padding-bottom: var(--wa-space-m);
        margin-bottom: var(--wa-space-m);
        border-bottom: 1px solid var(--wa-color-surface-lowered);
      }

      .section-header-info {
        display: flex;
        flex-direction: column;
        flex: 1;
        gap: var(--wa-space-s);
        min-width: 0;
      }

      .section-header-title-row {
        display: flex;
        align-items: center;
        gap: var(--wa-space-m);
        flex-wrap: wrap;
      }

      .section-image {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 140px;
        height: 100px;
        padding: var(--wa-space-s);
        background: var(--wa-color-surface-lowered);
        border-radius: var(--wa-border-radius-l);
        box-sizing: border-box;
      }

      .section-image img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }

      .section-title {
        margin: 0;
        font-size: var(--wa-font-size-l);
        font-weight: var(--wa-font-weight-bold);
        color: var(--wa-color-text-normal);
      }

      .section-desc {
        margin: 0;
        font-size: var(--wa-font-size-xs);
        color: var(--wa-color-text-quiet);
        line-height: 1.5;
      }

      .docs-link {
        display: inline-flex;
        align-items: center;
        gap: var(--wa-space-2xs);
        font-size: var(--wa-font-size-xs);
        color: var(--esphome-primary);
        text-decoration: underline;
      }

      .docs-link:hover {
        text-decoration: none;
      }

      .docs-link wa-icon {
        font-size: 14px;
      }

      .form {
        display: flex;
        flex-direction: column;
        gap: var(--wa-space-m);
      }

      .field {
        display: flex;
        flex-direction: column;
        gap: var(--wa-space-2xs);
      }

      .field-label {
        font-size: var(--wa-font-size-s);
        font-weight: var(--wa-font-weight-semibold);
        color: var(--wa-color-text-normal);
        display: flex;
        align-items: center;
        gap: var(--wa-space-2xs);
      }

      .field-label .required {
        color: var(--esphome-error);
      }

      .field-error {
        color: var(--esphome-error);
        font-size: var(--wa-font-size-2xs);
        margin-top: var(--wa-space-2xs);
      }

      .field-description {
        font-size: var(--wa-font-size-2xs);
        color: var(--wa-color-text-quiet);
        margin: 0;
      }

      /* Push the input/select away from a description sitting right above it
         so the two pieces of text don't collide. */
      .field-description + input,
      .field-description + textarea,
      .field-description + wa-select {
        margin-top: 8px;
      }

      .help-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        color: var(--wa-color-text-quiet);
        font-size: 16px;
        transition: color 0.12s;
        margin-left: auto;
      }

      .help-button:hover {
        color: var(--esphome-primary);
      }

      .advanced-section {
        margin-top: var(--wa-space-l);
      }

      .advanced-toggle {
        display: inline-flex;
        align-items: center;
        gap: var(--wa-space-2xs);
        background: none;
        border: none;
        padding: 0;
        font-family: inherit;
        font-size: var(--wa-font-size-s);
        font-weight: var(--wa-font-weight-bold);
        color: var(--wa-color-text-quiet);
        cursor: pointer;
      }

      .advanced-toggle:hover {
        color: var(--wa-color-text-normal);
      }

      .advanced-toggle wa-icon {
        font-size: 18px;
      }

      .advanced-fields {
        display: flex;
        flex-direction: column;
        gap: var(--wa-space-m);
        margin-top: var(--wa-space-m);
      }

      /* ─── Nested group ────────────────────────────────────────
         Container for a NESTED config entry. Visually framed so
         users can tell sub-readings (e.g. a sensor's temperature
         block) apart from sibling fields. */
      .nested-group {
        display: flex;
        flex-direction: column;
        gap: var(--wa-space-s);
        padding: var(--wa-space-s) var(--wa-space-m);
        background: var(--wa-color-surface-lowered);
        border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
        border-radius: var(--wa-border-radius-m);
      }

      .nested-toggle {
        display: inline-flex;
        align-items: center;
        gap: var(--wa-space-2xs);
        background: none;
        border: none;
        padding: 0;
        font-family: inherit;
        font-size: var(--wa-font-size-s);
        font-weight: var(--wa-font-weight-bold);
        color: var(--wa-color-text-normal);
        cursor: pointer;
        text-align: left;
      }

      .nested-toggle:hover {
        color: var(--esphome-primary);
      }

      .nested-toggle wa-icon {
        font-size: 18px;
      }

      .nested-title {
        flex: 1;
      }

      .nested-platform {
        font-size: var(--wa-font-size-2xs);
        font-weight: var(--wa-font-weight-normal);
        color: var(--wa-color-text-quiet);
        background: var(--wa-color-surface-default);
        border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
        border-radius: var(--wa-border-radius-s);
        padding: 1px 6px;
        margin-left: var(--wa-space-xs);
      }

      .nested-fields {
        display: flex;
        flex-direction: column;
        gap: var(--wa-space-m);
        padding-top: var(--wa-space-xs);
      }

      .multi-row {
        display: flex;
        align-items: center;
        gap: var(--wa-space-2xs);
      }

      .multi-row .multi-input {
        flex: 1;
        font-family: inherit;
        font-size: var(--wa-font-size-s);
        padding: 6px 12px;
        border-radius: var(--wa-border-radius-m);
        border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
        background: var(--wa-color-surface-default);
        color: var(--wa-color-text-normal);
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.12s, box-shadow 0.12s;
      }

      .multi-row .multi-input:focus {
        border-color: var(--esphome-primary);
        box-shadow: 0 0 0 3px
          color-mix(in srgb, var(--esphome-primary), transparent 80%);
      }

      .multi-row .multi-input.invalid {
        border-color: var(--esphome-error);
      }

      .multi-row .multi-input:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* Combobox input — same styling as multi-row inputs but standalone. */
      .combobox-input {
        font-family: inherit;
        font-size: var(--wa-font-size-s);
        padding: 6px 12px;
        border-radius: var(--wa-border-radius-m);
        border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
        background: var(--wa-color-surface-default);
        color: var(--wa-color-text-normal);
        outline: none;
        box-sizing: border-box;
        transition: border-color 0.12s, box-shadow 0.12s;
      }

      .combobox-input:focus {
        border-color: var(--esphome-primary);
        box-shadow: 0 0 0 3px
          color-mix(in srgb, var(--esphome-primary), transparent 80%);
      }

      .combobox-input.invalid {
        border-color: var(--esphome-error);
      }

      .combobox-input:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .multi-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 4px 10px;
        background: transparent;
        border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
        border-radius: var(--wa-border-radius-m);
        color: var(--wa-color-text-quiet);
        font-family: inherit;
        font-size: var(--wa-font-size-xs);
        cursor: pointer;
        transition:
          background 0.12s,
          border-color 0.12s,
          color 0.12s;
      }

      .multi-btn:hover {
        background: var(--wa-color-surface-lowered);
        color: var(--wa-color-text-normal);
      }

      .multi-btn wa-icon {
        font-size: 14px;
      }

      .multi-add {
        align-self: flex-start;
        margin-top: var(--wa-space-2xs);
      }

      .textarea-field {
        font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        font-size: var(--wa-font-size-xs);
        padding: var(--wa-space-s);
        border-radius: var(--wa-border-radius-m);
        border: var(--wa-border-width-s) solid var(--wa-color-surface-border);
        background: var(--wa-color-surface-default);
        color: var(--wa-color-text-normal);
        resize: vertical;
        min-height: 80px;
      }

      .textarea-field.invalid {
        border-color: var(--esphome-error);
      }

      /* ─── Pin selector option layout ──────────────────────────
         Each option in the GPIO pin dropdown stacks the pin name on
         top and any supporting text (occupied_by / notes / GPIO num)
         below it in a smaller, muted line. */
      .pin-option-stack {
        display: inline-flex;
        flex-direction: column;
        gap: 1px;
        line-height: 1.25;
      }

      .pin-option-primary {
        font-size: var(--wa-font-size-s);
        font-weight: var(--wa-font-weight-semibold);
        color: var(--wa-color-text-normal);
      }

      .pin-option-secondary {
        font-size: var(--wa-font-size-2xs);
        color: var(--wa-color-text-quiet);
        font-style: italic;
      }

      .pin-option[disabled] .pin-option-primary,
      .pin-option[disabled] .pin-option-secondary {
        color: var(--wa-color-text-quiet);
      }

      .pin-option-primary {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      .pin-warn-icon {
        color: var(--esphome-warning, #d97706);
        font-size: 14px;
        flex-shrink: 0;
      }

      .pin-option--warn .pin-option-secondary {
        color: var(--esphome-warning, #d97706);
        font-style: normal;
      }

      /* ─── ID reference picker option layout ──────────────────
         Same two-line stacked treatment as the pin selector. */
      .id-option-stack {
        display: inline-flex;
        flex-direction: column;
        gap: 1px;
        line-height: 1.25;
      }

      .id-option-primary {
        font-size: var(--wa-font-size-s);
        font-weight: var(--wa-font-weight-semibold);
        color: var(--wa-color-text-normal);
      }

      .id-option-secondary {
        font-size: var(--wa-font-size-2xs);
        color: var(--wa-color-text-quiet);
        font-style: italic;
      }

      .alert-entry {
        padding: var(--wa-space-s) var(--wa-space-m);
        background: var(--wa-color-surface-lowered);
        border-radius: var(--wa-border-radius-m);
        font-size: var(--wa-font-size-xs);
        color: var(--wa-color-text-quiet);
        line-height: 1.5;
      }

      .label-entry {
        font-size: var(--wa-font-size-xs);
        color: var(--wa-color-text-subtle);
        font-style: italic;
      }

      .switch-field {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--wa-space-m);
      }

      .switch-field .field-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--wa-space-s);
        padding-top: var(--wa-space-s);
      }

      .save-button {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        border: none;
        background: var(--esphome-primary);
        color: var(--esphome-on-primary);
        padding: var(--wa-space-xs) var(--wa-space-m);
        border-radius: var(--wa-border-radius-m);
        cursor: pointer;
        font-size: var(--wa-font-size-s);
        font-weight: var(--wa-font-weight-bold);
        font-family: inherit;
      }

      .save-button:hover:not(:disabled) {
        opacity: 0.9;
      }

      .save-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .save-button wa-icon {
        font-size: 16px;
      }

      .error {
        color: var(--esphome-error);
        font-size: var(--wa-font-size-s);
      }

      .loading {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--wa-space-xl);
      }

      /* Sizing only — chrome (border / radius / focus ring) comes from the
         shared inputStyles so wa-select matches every other input field. */
      wa-select {
        width: 100%;
      }
    `,
  ];

  updated(changedProperties: Map<string, unknown>) {
    if (
      (changedProperties.has("sectionKey") ||
        changedProperties.has("configuration") ||
        changedProperties.has("fromLine")) &&
      this.sectionKey &&
      this.configuration
    ) {
      this._loadConfig();
    }
  }

  /** Reload config from backend if the form has no unsaved changes. */
  public reload() {
    if (!this._dirty && this.sectionKey && this.configuration) {
      this._loadConfig();
    }
  }

  private async _loadConfig() {
    const id = ++this._loadId;
    this._loading = true;
    this._error = "";
    this._config = null;
    this._dirty = false;

    try {
      // Pass the device's target platform so the backend can resolve
      // any cv.SplitDefault fields into a single default_value.
      const platform = this.board?.esphome.platform;
      const component = await this._api.getComponent(this.sectionKey, platform);

      // Stale — user clicked another component while this was loading
      if (id !== this._loadId) return;

      if (!component) {
        this._error = this._localize("device.unknown_section", { key: this.sectionKey });
        this._loading = false;
        return;
      }

      const yaml = await this._api.getConfig(this.configuration);

      if (id !== this._loadId) return;

      this._config = {
        section_key: this.sectionKey,
        section_type: "core",
        title: component.name,
        description: component.description,
        docs_url: component.docs_url,
        icon: "",
        image_url: component.image_url,
        entries: component.config_entries,
      };
      this._values = this._parseYamlSectionValues(yaml);
      this._presentComponents = this._parseTopLevelComponents(yaml);
      this._yaml = yaml;
    } catch (e) {
      if (id !== this._loadId) return;
      const msg = e instanceof Error ? e.message : "";
      // Show a friendly message for timeouts instead of the raw error
      this._error = msg.includes("timed out")
        ? this._localize("device.load_config_error")
        : msg || this._localize("device.load_config_error");
    } finally {
      if (id === this._loadId) {
        this._loading = false;
      }
    }
  }

  /**
   * Extract the set of top-level component keys configured in the YAML
   * (e.g. ["wifi", "api", "mqtt", "switch"]). Used to evaluate
   * `depends_on_component` visibility predicates on config entries.
   *
   * A "top-level component" is any non-comment line starting at column 0
   * with the shape `key:` — same heuristic the navigator uses for
   * top-level sections.
   */
  private _parseTopLevelComponents(yaml: string): Set<string> {
    const present = new Set<string>();
    for (const line of yaml.split("\n")) {
      const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
      if (match) present.add(match[1]);
    }
    return present;
  }

  /**
   * Parse simple key: value pairs from the YAML section at the current fromLine.
   * Only reads direct children (2-space indent) — skips nested blocks.
   */
  private _parseYamlSectionValues(yaml: string): Record<string, unknown> {
    const lines = yaml.split("\n");
    const values: Record<string, unknown> = {};

    // Find the section start
    let startIdx = -1;
    if (this.fromLine !== undefined) {
      startIdx = this.fromLine - 1; // 1-indexed to 0-indexed
    } else {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith(`${this.sectionKey}:`)) {
          startIdx = i;
          break;
        }
      }
    }
    if (startIdx < 0) return values;

    // Detect if this is a list item (  - key: val) vs a top-level section (key:)
    const isListItem = /^\s+-\s/.test(lines[startIdx]);
    // For list items, the first line may have `  - platform: binary`
    // and children are at 4-space indent. For top-level, children are at 2-space.
    const childIndent = isListItem ? "    " : "  ";
    const childRegex = new RegExp(`^${childIndent}([a-zA-Z_][a-zA-Z0-9_]*):\\s*(.*)$`);

    // Also parse the first line of a list item (  - key: value)
    if (isListItem) {
      const firstMatch = lines[startIdx].match(
        /^\s+-\s+([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/
      );
      if (firstMatch) {
        const key = firstMatch[1];
        let raw = firstMatch[2].trim();
        if (raw !== "") {
          if (
            (raw.startsWith('"') && raw.endsWith('"')) ||
            (raw.startsWith("'") && raw.endsWith("'"))
          )
            raw = raw.slice(1, -1);
          if (raw === "true") values[key] = true;
          else if (raw === "false") values[key] = false;
          else values[key] = raw;
        }
      }
    }

    // Indent at which sub-items of a child list appear (2 spaces deeper
    // than child indent — that's the standard YAML offset for the dash).
    const listItemIndent = `${childIndent}  - `;
    const listItemRegex = new RegExp(
      `^${childIndent}  -\\s+(.*)$`,
    );

    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === "") continue;
      // Stop at a line with equal or less indentation (next item or top-level key)
      if (isListItem) {
        if (/^\s+-\s/.test(line) || /^[a-zA-Z]/.test(line)) break;
      } else {
        if (/^[a-zA-Z]/.test(line)) break;
      }

      const match = line.match(childRegex);
      if (!match) continue;

      const key = match[1];
      let raw = match[2].trim();

      // Empty value: either a list of items, a nested object, or just
      // an empty key (skip).
      if (raw === "") {
        // Look at the first non-empty line below to decide.
        let peek = i + 1;
        while (peek < lines.length && lines[peek].trim() === "") peek++;
        if (peek >= lines.length) continue;
        const peekLine = lines[peek];

        // Block list of scalars (e.g. `options:` then `  - "UIT"` lines).
        if (peekLine.startsWith(listItemIndent)) {
          const items: string[] = [];
          let j = i + 1;
          for (; j < lines.length; j++) {
            const next = lines[j];
            if (next.trim() === "") continue;
            if (!next.startsWith(listItemIndent)) break;
            const m = next.match(listItemRegex);
            if (!m) break;
            let item = m[1].trim();
            if (
              (item.startsWith('"') && item.endsWith('"')) ||
              (item.startsWith("'") && item.endsWith("'"))
            ) {
              item = item.slice(1, -1);
            }
            items.push(item);
          }
          if (items.length > 0) {
            values[key] = items;
            i = j - 1;
          }
          continue;
        }

        // Nested object (e.g. `temperature:` then `      name: ...`
        // lines indented one level deeper than `childIndent`).
        const nestedIndent = `${childIndent}  `;
        if (peekLine.startsWith(nestedIndent)) {
          const result = this._parseNestedBlock(lines, i + 1, nestedIndent);
          if (Object.keys(result.values).length > 0) {
            values[key] = result.values;
          }
          i = result.endIdx - 1;
          continue;
        }
        continue;
      }

      // Inline flow-style list `[a, b, c]`
      if (raw.startsWith("[") && raw.endsWith("]")) {
        const inner = raw.slice(1, -1).trim();
        const items = inner === ""
          ? []
          : inner.split(",").map((p) => {
              let v = p.trim();
              if (
                (v.startsWith('"') && v.endsWith('"')) ||
                (v.startsWith("'") && v.endsWith("'"))
              ) {
                v = v.slice(1, -1);
              }
              return v;
            });
        values[key] = items;
        continue;
      }

      if (
        (raw.startsWith('"') && raw.endsWith('"')) ||
        (raw.startsWith("'") && raw.endsWith("'"))
      ) {
        raw = raw.slice(1, -1);
      }
      if (raw === "true") values[key] = true;
      else if (raw === "false") values[key] = false;
      else values[key] = raw;
    }

    return values;
  }

  /**
   * Parse a nested YAML block at the given indent level. Returns the
   * extracted values plus the array index immediately after the block
   * (for the caller to advance past). Recurses into deeper-nested
   * objects and handles block lists at the same level.
   */
  private _parseNestedBlock(
    lines: string[],
    startIdx: number,
    indent: string,
  ): { values: Record<string, unknown>; endIdx: number } {
    const childRegex = new RegExp(
      `^${indent}([a-zA-Z_][a-zA-Z0-9_]*):\\s*(.*)$`,
    );
    const listItemPrefix = `${indent}  - `;
    const listItemRegex = new RegExp(`^${indent}  -\\s+(.*)$`);
    const values: Record<string, unknown> = {};
    let i = startIdx;
    while (i < lines.length) {
      const line = lines[i];
      if (line.trim() === "") {
        i++;
        continue;
      }
      // Block ends when indentation drops below `indent`.
      if (!line.startsWith(indent)) break;
      const match = line.match(childRegex);
      if (!match) {
        i++;
        continue;
      }
      const key = match[1];
      let raw = match[2].trim();

      if (raw === "") {
        let peek = i + 1;
        while (peek < lines.length && lines[peek].trim() === "") peek++;
        if (peek < lines.length && lines[peek].startsWith(listItemPrefix)) {
          const items: string[] = [];
          let j = i + 1;
          for (; j < lines.length; j++) {
            if (lines[j].trim() === "") continue;
            if (!lines[j].startsWith(listItemPrefix)) break;
            const m = lines[j].match(listItemRegex);
            if (!m) break;
            let item = m[1].trim();
            if (
              (item.startsWith('"') && item.endsWith('"')) ||
              (item.startsWith("'") && item.endsWith("'"))
            ) {
              item = item.slice(1, -1);
            }
            items.push(item);
          }
          values[key] = items;
          i = j;
          continue;
        }
        const deeper = `${indent}  `;
        if (peek < lines.length && lines[peek].startsWith(deeper)) {
          const sub = this._parseNestedBlock(lines, i + 1, deeper);
          if (Object.keys(sub.values).length > 0) values[key] = sub.values;
          i = sub.endIdx;
          continue;
        }
        i++;
        continue;
      }

      if (raw.startsWith("[") && raw.endsWith("]")) {
        const inner = raw.slice(1, -1).trim();
        values[key] =
          inner === ""
            ? []
            : inner.split(",").map((p) => {
                let v = p.trim();
                if (
                  (v.startsWith('"') && v.endsWith('"')) ||
                  (v.startsWith("'") && v.endsWith("'"))
                ) {
                  v = v.slice(1, -1);
                }
                return v;
              });
        i++;
        continue;
      }

      if (
        (raw.startsWith('"') && raw.endsWith('"')) ||
        (raw.startsWith("'") && raw.endsWith("'"))
      ) {
        raw = raw.slice(1, -1);
      }
      if (raw === "true") values[key] = true;
      else if (raw === "false") values[key] = false;
      else values[key] = raw;
      i++;
    }
    return { values, endIdx: i };
  }

  private _onImageError(e: Event) {
    const img = e.target as HTMLImageElement;
    const fallback = "/assets/board/default.svg";
    if (img.src !== window.location.origin + fallback && !img.src.endsWith(fallback)) {
      img.src = fallback;
    }
  }

  protected render() {
    if (this._loading) {
      return html`<div class="loading"><wa-spinner></wa-spinner></div>`;
    }

    if (this._error && !this._config) {
      return html`<p class="error">${this._error}</p>`;
    }

    if (!this._config) return nothing;

    // Filter entries by visibility (hidden + depends_on), then split into
    // standard and advanced. Advanced entries get rendered in a separate
    // collapsible section at the bottom.
    const visibleEntries = this._config.entries.filter((e) =>
      isEntryVisible(e, this._values, this._presentComponents)
    );
    const standardEntries = visibleEntries.filter((e) => !e.advanced);
    const advancedEntries = visibleEntries.filter((e) => e.advanced);

    return html`
      <div class="section-header">
        <div class="section-header-info">
          <div class="section-header-title-row">
            <h3 class="section-title">${this._config.title}</h3>
            ${this._config.docs_url
              ? html`<a
                  class="docs-link"
                  href=${this._config.docs_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  ${this._localize("device.docs")}
                  <wa-icon library="mdi" name="open-in-new"></wa-icon>
                </a>`
              : nothing}
          </div>
          <p class="section-desc">${this._config.description}</p>
        </div>
        <div class="section-image">
          <img
            src=${this._config.image_url || "/assets/board/default.svg"}
            alt=${this._config.title}
            referrerpolicy="no-referrer"
            @error=${this._onImageError}
          />
        </div>
      </div>
      <div class="form">${standardEntries.map((entry) => this._renderEntry(entry))}</div>
      ${advancedEntries.length > 0
        ? this._renderAdvancedSection(advancedEntries)
        : nothing}
      ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
      <div class="actions">
        <button
          class="save-button"
          ?disabled=${this._saving || !this._dirty}
          @click=${this._onSave}
        >
          <wa-icon library="mdi" name="content-save"></wa-icon>
          ${this._saving
            ? this._localize("device.saving")
            : this._localize("device.save")}
        </button>
      </div>
    `;
  }

  private _renderAdvancedSection(entries: ConfigEntry[]) {
    return html`
      <div class="advanced-section">
        <button
          class="advanced-toggle"
          @click=${() => {
            this._setAdvancedOpen(!this._advancedOpen);
          }}
        >
          <wa-icon
            library="mdi"
            name=${this._advancedOpen ? "chevron-up" : "chevron-down"}
          ></wa-icon>
          ${this._localize("device.advanced_options")}
        </button>
        ${this._advancedOpen
          ? html`<div class="advanced-fields">
              ${entries.map((entry) => this._renderEntry(entry))}
            </div>`
          : nothing}
      </div>
    `;
  }

  private _renderEntry(entry: ConfigEntry, path: string[] = [entry.key]) {
    // Layout-only entries: render before any value-driven branches.
    if (entry.type === ConfigEntryType.DIVIDER) {
      return html`<wa-divider></wa-divider>`;
    }
    if (entry.type === ConfigEntryType.LABEL) {
      return html`<p class="label-entry">${this._labelFor(entry)}</p>`;
    }
    if (entry.type === ConfigEntryType.ALERT) {
      return html`<div class="alert-entry">${this._labelFor(entry)}</div>`;
    }

    // Nested groups: render a collapsible container with the inner schema.
    if (entry.type === ConfigEntryType.NESTED) {
      return this._renderNestedField(entry, path);
    }

    // Multi-value entries get a list editor regardless of underlying type.
    if (entry.multi_value) {
      return this._renderMultiValueField(entry, path);
    }

    // Any entry with options becomes a dropdown — independent of `type`.
    // The backend signals "use a dropdown" by populating `options`; the
    // underlying value type (string, integer, etc.) is unchanged.
    if (entry.options && entry.options.length > 0) {
      return this._renderSelectField(entry, path);
    }

    switch (entry.type) {
      case ConfigEntryType.BOOLEAN:
        return this._renderBooleanField(entry, path);

      case ConfigEntryType.SELECT:
        // Backwards-compat: if the deprecated SELECT type is used without
        // options, fall through to a string input rather than a broken select.
        return this._renderStringField(entry, "text", path);

      case ConfigEntryType.SECURE_STRING:
        return this._renderStringField(entry, "password", path);

      case ConfigEntryType.INTEGER:
      case ConfigEntryType.FLOAT:
        return this._renderNumberField(entry, path);

      case ConfigEntryType.PIN:
        return this._renderPinField(entry, path);

      case ConfigEntryType.COLOR:
        return this._renderStringField(entry, "color", path);

      case ConfigEntryType.MAC_ADDRESS:
        return this._renderStringField(entry, "text", path);

      case ConfigEntryType.LAMBDA:
      case ConfigEntryType.JSON:
        return this._renderTextareaField(entry, path);

      case ConfigEntryType.ID:
        // When the schema declares a domain via references_component
        // (e.g. "i2c", "output", "sensor"), render a dropdown of
        // existing components of that domain configured in the YAML.
        // Free-form ID entries fall through to the text input.
        if (entry.references_component) {
          return this._renderIdReferenceField(entry, path);
        }
        return this._renderStringField(entry, "text", path);

      // ICON, TRIGGER, TIME_PERIOD, STRING, UNKNOWN → text input
      // (richer pickers are a follow-up — schemas don't yet expose enough
      // info for cross-component trigger lookups).
      default:
        return this._renderStringField(entry, "text", path);
    }
  }

  /**
   * Render a nested config group as a collapsible section.
   *
   * The outer entry has no value of its own — its children live at
   * `path` inside `_values` (e.g. `_values.temperature.name`). When
   * `platform_type` is set the group represents an entity sub-reading
   * (sensor, binary_sensor, ...) and the relevant base fields are
   * already included in `entry.config_entries` by the backend, so we
   * just recurse.
   */
  private _renderNestedField(entry: ConfigEntry, path: string[]) {
    const children = entry.config_entries ?? [];
    const isOpen = this._nestedOpenSections.has(path.join("."));
    const visibleChildren = children.filter((c) =>
      isEntryVisible(c, this._scopeValues(path), this._presentComponents),
    );
    return html`
      <div class="nested-group" data-field-key=${path.join(".")}>
        <button
          type="button"
          class="nested-toggle"
          @click=${() => this._toggleNested(path.join("."))}
        >
          <wa-icon
            library="mdi"
            name=${isOpen ? "chevron-up" : "chevron-down"}
          ></wa-icon>
          <span class="nested-title">${this._labelFor(entry)}</span>
          ${entry.platform_type
            ? html`<span class="nested-platform">${entry.platform_type}</span>`
            : nothing}
        </button>
        ${isOpen
          ? html`<div class="nested-fields">
              ${visibleChildren.map((child) =>
                this._renderEntry(child, [...path, child.key]),
              )}
            </div>`
          : nothing}
      </div>
    `;
  }

  /** Read the values dict at `path` so children can evaluate their own
   *  depends_on predicates against their siblings. */
  private _scopeValues(path: string[]): Record<string, unknown> {
    const v = this._getAt(path);
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  }

  private _toggleNested(key: string) {
    const next = new Set(this._nestedOpenSections);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this._nestedOpenSections = next;
  }

  private _renderStringField(
    entry: ConfigEntry,
    inputType: string,
    path: string[] = [entry.key],
  ) {
    const value = String(this._getAt(path) ?? "");
    const invalid = this._errorAt(path) !== null;
    return html`
      <div class="field" data-field-key=${path.join(".")}>
        ${this._renderLabel(entry)}
        <input
          type=${inputType}
          class=${invalid ? "invalid" : ""}
          .value=${value}
          ?disabled=${this._saving}
          placeholder=${String(entry.default_value ?? "")}
          @input=${(e: Event) =>
            this._setAt(path, (e.target as HTMLInputElement).value)}
        />
        ${this._fieldErrorAt(path)}
      </div>
    `;
  }

  private _renderNumberField(entry: ConfigEntry, path: string[] = [entry.key]) {
    const value = String(this._getAt(path) ?? "");
    const invalid = this._errorAt(path) !== null;
    const min = entry.range ? String(entry.range[0]) : undefined;
    const max = entry.range ? String(entry.range[1]) : undefined;
    return html`
      <div class="field" data-field-key=${path.join(".")}>
        ${this._renderLabel(entry)}
        <input
          type="number"
          class=${invalid ? "invalid" : ""}
          .value=${value}
          ?disabled=${this._saving}
          min=${min ?? ""}
          max=${max ?? ""}
          placeholder=${String(entry.default_value ?? "")}
          @input=${(e: Event) => {
            const raw = (e.target as HTMLInputElement).value;
            this._setAt(path, raw === "" ? "" : Number(raw));
          }}
        />
        ${this._fieldErrorAt(path)}
      </div>
    `;
  }

  private _renderBooleanField(entry: ConfigEntry, path: string[] = [entry.key]) {
    const raw = this._getAt(path);
    const checked = raw === true || raw === "true";
    return html`
      <div class="switch-field" data-field-key=${path.join(".")}>
        <div class="field-info">${this._renderLabel(entry)}</div>
        <wa-switch
          ?checked=${checked}
          ?disabled=${this._saving}
          @change=${(e: Event) =>
            this._setAt(
              path,
              (e.target as HTMLInputElement & { checked: boolean }).checked,
            )}
        ></wa-switch>
      </div>
    `;
  }

  private _renderSelectField(entry: ConfigEntry, path: string[] = [entry.key]) {
    const value = String(this._getAt(path) ?? "");
    const invalid = this._errorAt(path) !== null;

    // Combobox mode: options act as suggestions, user can also type a
    // custom value. Rendered as a plain input + datalist so the browser
    // shows autocomplete with the suggestions but doesn't restrict
    // input to the listed values.
    if (entry.allow_custom_value && entry.options && entry.options.length > 0) {
      const listId = `combobox-${path.join("-")}`;
      return html`
        <div class="field" data-field-key=${path.join(".")}>
          ${this._renderLabel(entry)}
          <input
            type="text"
            class="combobox-input ${invalid ? "invalid" : ""}"
            list=${listId}
            .value=${value}
            ?disabled=${this._saving}
            placeholder=${String(entry.default_value ?? "")}
            @input=${(e: Event) =>
              this._setAt(path, (e.target as HTMLInputElement).value)}
          />
          <datalist id=${listId}>
            ${entry.options.map(
              (opt) => html`<option value=${opt.value}>${opt.label}</option>`,
            )}
          </datalist>
          ${this._fieldErrorAt(path)}
        </div>
      `;
    }

    return html`
      <div class="field" data-field-key=${path.join(".")}>
        ${this._renderLabel(entry)}
        <wa-select
          class=${invalid ? "invalid" : ""}
          ?disabled=${this._saving}
          @change=${(e: Event) =>
            this._setAt(path, (e.target as HTMLSelectElement).value)}
        >
          ${(entry.options ?? []).map(
            (opt) => html`<wa-option
              value=${opt.value}
              ?selected=${opt.value === value}
              >${opt.label}</wa-option
            >`,
          )}
        </wa-select>
        ${this._fieldErrorAt(path)}
      </div>
    `;
  }

  /**
   * Render a list editor for a `multi_value` entry. Stores values as
   * `string[]` and lets the user add/remove rows. The underlying type
   * still drives validation but rendering uses a basic text input — a
   * richer per-type sub-renderer is a follow-up.
   */
  private _renderMultiValueField(
    entry: ConfigEntry,
    path: string[] = [entry.key],
  ) {
    const raw = this._getAt(path);
    const items: string[] = Array.isArray(raw) ? raw.map((v) => String(v)) : [];
    const invalid = this._errorAt(path) !== null;
    return html`
      <div class="field" data-field-key=${path.join(".")}>
        ${this._renderLabel(entry)}
        ${items.length === 0
          ? html`<p class="field-description">
              ${this._localize("device.multi_value_empty")}
            </p>`
          : nothing}
        ${items.map(
          (item, i) => html`
            <div class="multi-row">
              <input
                type="text"
                class="multi-input ${invalid ? "invalid" : ""}"
                .value=${item}
                ?disabled=${this._saving}
                @input=${(e: Event) =>
                  this._updateMultiItem(
                    path,
                    i,
                    (e.target as HTMLInputElement).value,
                  )}
              />
              <button
                type="button"
                class="multi-btn"
                ?disabled=${this._saving}
                aria-label=${this._localize("device.multi_value_remove")}
                @click=${() => this._removeMultiItem(path, i)}
              >
                <wa-icon library="mdi" name="close"></wa-icon>
              </button>
            </div>
          `,
        )}
        <button
          type="button"
          class="multi-btn multi-add"
          ?disabled=${this._saving}
          @click=${() => this._addMultiItem(path)}
        >
          <wa-icon library="mdi" name="plus"></wa-icon>
          ${this._localize("device.multi_value_add")}
        </button>
        ${this._fieldErrorAt(path)}
      </div>
    `;
  }

  /**
   * Render a GPIO pin selector backed by the device's board metadata.
   *
   * Pins are filtered by `entry.pin_features` (every required feature
   * must be present on the pin). Pins marked `available=false` are kept
   * in the list but disabled, with their `occupied_by` / `notes` shown
   * as supporting text so the user understands why they can't pick them.
   */
  private _renderPinField(entry: ConfigEntry, path: string[] = [entry.key]) {
    // No board context — fall back to a plain text input so the field
    // remains editable (the user might know the pin name even without
    // the board metadata loaded).
    if (!this.board || this.board.pins.length === 0) {
      return this._renderStringField(entry, "text", path);
    }

    const value = String(this._getAt(path) ?? "");
    const invalid = this._errorAt(path) !== null;
    const required = entry.pin_features ?? [];
    const matchesFeatures = (pin: BoardPin) =>
      required.every((f) => pin.features.includes(f));

    const visible = this.board.pins.filter(matchesFeatures);

    // Pins claimed by other components in the YAML (excluding the section
    // we're currently editing — that one's allowed to keep its own pin).
    const usedPins = this._findUsedPins(
      this._yaml,
      this.fromLine,
      this._sectionEndLine(),
    );

    return html`
      <div class="field" data-field-key=${path.join(".")}>
        ${this._renderLabel(entry)}
        <wa-select
          class=${invalid ? "invalid" : ""}
          ?disabled=${this._saving}
          @change=${(e: Event) =>
            this._setAt(path, (e.target as HTMLSelectElement).value)}
        >
          ${visible.map((pin) => {
            const optValue = `GPIO${pin.gpio}`;
            const primary = pin.label || optValue;
            const occupiedBy = pin.occupied_by || "";
            const usedBy = usedPins.get(pin.gpio) || "";
            // An input-only pin can't satisfy a field that needs to drive
            // an output. PinMode.OUTPUT obviously requires output; the
            // bidirectional INPUT_OUTPUT mode also needs output capability.
            const needsOutput =
              entry.pin_mode === PinMode.OUTPUT ||
              entry.pin_mode === PinMode.INPUT_OUTPUT;
            const isInputOnly = pin.features.includes(PinFeature.INPUT_ONLY);
            const inputOnlyConflict = needsOutput && isInputOnly;
            // Disable when hardware says so OR when the pin can't fulfil
            // the requested direction. YAML-level conflicts stay enabled.
            const disabled = pin.available === false || inputOnlyConflict;

            // Show a warning when the pin is already claimed — either by
            // the board metadata (occupied_by) or by another component in
            // the YAML. We don't disable in the YAML-conflict case so the
            // user can still pick if they know what they're doing.
            const inUse = !!(occupiedBy || usedBy);
            const inUseText = occupiedBy
              ? this._localize("device.pin_occupied_by", { name: occupiedBy })
              : usedBy
                ? this._localize("device.pin_used_by", { name: usedBy })
                : "";
            const baseSupporting = inputOnlyConflict
              ? this._localize("device.pin_input_only")
              : pin.notes ||
                (pin.available === false ? this._localize("device.pin_unavailable") : "");

            const secondaryParts: string[] = [];
            if (pin.label && pin.label !== optValue) secondaryParts.push(optValue);
            if (inUseText) secondaryParts.push(inUseText);
            if (baseSupporting) secondaryParts.push(baseSupporting);
            const secondary = secondaryParts.join(" • ");
            const titleText = [inUseText, baseSupporting].filter(Boolean).join(" — ");

            return html`<wa-option
              class="pin-option ${inUse ? "pin-option--warn" : ""}"
              value=${optValue}
              .label=${primary}
              ?selected=${optValue === value}
              ?disabled=${disabled}
              title=${titleText}
            >
              <span class="pin-option-stack">
                <span class="pin-option-primary">
                  ${primary}
                  ${inUse
                    ? html`<wa-icon
                        class="pin-warn-icon"
                        library="mdi"
                        name="alert-circle-outline"
                      ></wa-icon>`
                    : nothing}
                </span>
                ${secondary
                  ? html`<span class="pin-option-secondary">${secondary}</span>`
                  : nothing}
              </span>
            </wa-option>`;
          })}
        </wa-select>
        ${this._fieldErrorAt(path)}
      </div>
    `;
  }

  /**
   * Scan the device YAML for GPIO pin assignments and return a map of
   * `{gpio_number → component_domain}`. A "pin assignment" is any line
   * whose value matches the `GPIOnn` pattern under a top-level component
   * section.
   *
   * Lines between [excludeFromLine, excludeToLine] (the currently
   * edited section) are skipped — the user's own pin shouldn't be
   * flagged as conflicting with itself.
   */
  private _findUsedPins(
    yaml: string,
    excludeFromLine?: number,
    excludeToLine?: number,
  ): Map<number, string> {
    const used = new Map<number, string>();
    if (!yaml) return used;
    const lines = yaml.split("\n");

    let currentDomain = "";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const topMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):/);
      if (topMatch) {
        currentDomain = topMatch[1];
        continue;
      }
      // 1-indexed CM line numbers are stored on the section, so map
      // array index → 1-indexed line number for the comparison.
      const lineNo = i + 1;
      if (
        excludeFromLine !== undefined &&
        excludeToLine !== undefined &&
        lineNo >= excludeFromLine &&
        lineNo <= excludeToLine
      ) {
        continue;
      }
      // Match any value position with `GPIOnn` (pin: GPIO5, sda: GPIO21,
      // - GPIO13, etc.). Captures bare integers too (e.g. `pin: 5`)
      // when paired with a recognisable pin keyword.
      const gpioMatches = line.matchAll(/GPIO(\d+)/g);
      for (const m of gpioMatches) {
        const num = parseInt(m[1], 10);
        if (!Number.isNaN(num) && !used.has(num) && currentDomain) {
          used.set(num, currentDomain);
        }
      }
    }
    return used;
  }

  /** Best-effort end line of the currently edited YAML section. We use
   * a generous heuristic: from `fromLine` until the next non-indented
   * line. This is only used to skip the user's own pin from conflict
   * detection — false negatives are harmless. */
  private _sectionEndLine(): number | undefined {
    if (this.fromLine === undefined) return undefined;
    const lines = this._yaml.split("\n");
    for (let i = this.fromLine; i < lines.length; i++) {
      const line = lines[i];
      if (line === "") continue;
      if (/^[a-zA-Z]/.test(line)) return i; // 1-indexed: previous line was last
    }
    return lines.length;
  }

  /**
   * Render a dropdown listing existing component instances of the
   * `references_component` domain (e.g. an output ID picker for an
   * `rtttl` block lists all configured `output:` instances).
   *
   * Falls back to a plain text input when no instances are configured —
   * the user might be referencing a component they haven't added yet,
   * and we don't want to block them.
   */
  private _renderIdReferenceField(
    entry: ConfigEntry,
    path: string[] = [entry.key],
  ) {
    const domain = entry.references_component || "";
    const candidates = this._findReferencedComponents(this._yaml, domain);

    if (candidates.length === 0) {
      // Fall back to text input but with a hint in the label / help.
      return this._renderStringField(entry, "text", path);
    }

    const value = String(this._getAt(path) ?? "");
    const invalid = this._errorAt(path) !== null;
    return html`
      <div class="field" data-field-key=${path.join(".")}>
        ${this._renderLabel(entry)}
        <wa-select
          class=${invalid ? "invalid" : ""}
          ?disabled=${this._saving}
          @change=${(e: Event) =>
            this._setAt(path, (e.target as HTMLSelectElement).value)}
        >
          ${candidates.map(
            (c) => html`<wa-option
              class="id-option"
              value=${c.id}
              .label=${c.name || c.id}
              ?selected=${c.id === value}
            >
              <span class="id-option-stack">
                <span class="id-option-primary">${c.name || c.id}</span>
                <span class="id-option-secondary"
                  >${c.name ? `${c.id} · ${domain}` : domain}</span
                >
              </span>
            </wa-option>`,
          )}
        </wa-select>
        ${this._fieldErrorAt(path)}
      </div>
    `;
  }

  /**
   * Scan the device YAML for configured component instances of the
   * given top-level domain (e.g. "i2c", "output", "sensor"). Returns
   * an array of `{id, name}` for each list item that exposes an `id:`.
   *
   * The parser is deliberately simple — it only looks at items
   * directly under the matching top-level key and extracts `id:` /
   * `name:` from indented children. It doesn't need to handle nested
   * blocks or anchors because the YAML produced by ESPHome and our
   * own form is always shallow at this level.
   */
  private _findReferencedComponents(
    yaml: string,
    domain: string,
  ): Array<{ id: string; name: string }> {
    if (!domain) return [];
    const lines = yaml.split("\n");
    const result: Array<{ id: string; name: string }> = [];

    let inSection = false;
    let currentId = "";
    let currentName = "";

    const flush = () => {
      if (currentId) result.push({ id: currentId, name: currentName });
      currentId = "";
      currentName = "";
    };

    for (const line of lines) {
      // Top-level section change
      const topMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):/);
      if (topMatch) {
        flush();
        inSection = topMatch[1] === domain;
        continue;
      }
      if (!inSection) continue;

      // Start of a new list item — finalize the previous one
      if (/^\s*-\s/.test(line)) flush();

      const idMatch = line.match(
        /^\s+(?:-\s+)?id:\s*["']?(\S+?)["']?\s*$/,
      );
      if (idMatch) {
        currentId = idMatch[1];
        continue;
      }
      const nameMatch = line.match(
        /^\s+(?:-\s+)?name:\s*["']?(.+?)["']?\s*$/,
      );
      if (nameMatch) {
        currentName = nameMatch[1];
        continue;
      }
    }
    flush();

    return result;
  }

  /** Render a multi-line textarea for LAMBDA / JSON entries. */
  private _renderTextareaField(entry: ConfigEntry, path: string[] = [entry.key]) {
    const value = String(this._getAt(path) ?? "");
    const invalid = this._errorAt(path) !== null;
    return html`
      <div class="field" data-field-key=${path.join(".")}>
        ${this._renderLabel(entry)}
        <textarea
          class="textarea-field ${invalid ? "invalid" : ""}"
          rows="4"
          ?disabled=${this._saving}
          .value=${value}
          placeholder=${String(entry.default_value ?? "")}
          @input=${(e: Event) =>
            this._setAt(path, (e.target as HTMLTextAreaElement).value)}
        ></textarea>
        ${this._fieldErrorAt(path)}
      </div>
    `;
  }

  // ─── multi_value helpers ────────────────────────────────────────

  private _addMultiItem(path: string[]) {
    const cur = this._getAt(path);
    const current = Array.isArray(cur) ? cur : [];
    this._setAt(path, [...current, ""]);
  }

  private _removeMultiItem(path: string[], idx: number) {
    const cur = this._getAt(path);
    const current = Array.isArray(cur) ? cur : [];
    this._setAt(
      path,
      current.filter((_, i) => i !== idx),
    );
  }

  private _updateMultiItem(path: string[], idx: number, value: string) {
    const cur = this._getAt(path);
    const current = Array.isArray(cur) ? [...cur] : [];
    current[idx] = value;
    this._setAt(path, current);
  }

  /**
   * Render the label for a config entry, including the required indicator
   * and a help icon (when there's a description and/or help_link).
   *
   * Behavior of the help icon:
   *  - description only → opens a popover with the description text
   *  - help_link only   → behaves as a link to the docs URL
   *  - both             → popover with description and a "Learn more" link
   */
  private _renderLabel(entry: ConfigEntry) {
    return html`
      <label class="field-label">
        ${this._labelFor(entry)}
        ${entry.required ? html`<span class="required">*</span>` : nothing}
        ${entry.help_link ? this._renderHelpLink(entry) : nothing}
      </label>
      ${entry.description
        ? html`<p class="field-description">${entry.description}</p>`
        : nothing}
    `;
  }

  /**
   * Resolve the label for an entry. Preference order:
   *  1. translation_key (with translation_params) — if it resolves to
   *     something other than the raw key, use it.
   *  2. entry.label
   *  3. Title-cased entry.key as last-resort fallback.
   */
  private _labelFor(entry: ConfigEntry): string {
    if (entry.translation_key) {
      const params = (entry.translation_params || undefined) as
        | Record<string, string | number>
        | undefined;
      const translated = this._localize(entry.translation_key, params);
      if (translated && translated !== entry.translation_key) return translated;
    }
    if (entry.label) return entry.label;
    return entry.key
      .split("_")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
  }

  /** Inline docs-link icon shown next to the label when an entry has a
   *  `help_link`. Description text is rendered below the label as a regular
   *  paragraph (see `_renderLabel`) — no popover. */
  private _renderHelpLink(entry: ConfigEntry) {
    if (!entry.help_link) return nothing;
    return html`<a
      class="help-button"
      href=${entry.help_link}
      target="_blank"
      rel="noreferrer"
      title=${this._localize("device.docs")}
    >
      <wa-icon library="mdi" name="open-in-new"></wa-icon>
    </a>`;
  }

  /**
   * Read the value at a (possibly nested) path inside `_values`. Returns
   * undefined for missing paths or when the path crosses a non-object.
   */
  private _getAt(path: string[]): unknown {
    let cur: unknown = this._values;
    for (const k of path) {
      if (cur === null || typeof cur !== "object" || Array.isArray(cur)) {
        return undefined;
      }
      cur = (cur as Record<string, unknown>)[k];
    }
    return cur;
  }

  /**
   * Write a value at a (possibly nested) path inside `_values`,
   * preserving structural sharing of unrelated branches so Lit's
   * change detection is still cheap.
   */
  private _setAt(path: string[], value: unknown) {
    this._values = _setIn(this._values, path, value);
    this._dirty = true;
    const errKey = path.join(".");
    if (this._fieldErrors.has(errKey)) {
      const next = new Map(this._fieldErrors);
      next.delete(errKey);
      this._fieldErrors = next;
    }
  }

  private _errorAt(path: string[]): ValidationError | null {
    return this._fieldErrors.get(path.join(".")) ?? null;
  }

  private _fieldErrorAt(path: string[]) {
    const err = this._errorAt(path);
    if (!err) return nothing;
    return html`<span class="field-error">${this._localize(err.code, err.params)}</span>`;
  }

  private async _scrollFirstErrorIntoView(errors: Map<string, ValidationError>) {
    if (!this._config) return;

    // Walk the entry tree in render order looking for the first
    // (possibly nested) entry that owns an error. Returns the entry
    // and the dotted path that produced the matching error key.
    const firstHit = this._findFirstErrorTarget(
      this._config.entries,
      errors,
      [],
    );
    if (!firstHit) return;
    const { topEntry, path } = firstHit;

    // If the failing field lives in the collapsed Advanced section it isn't
    // in the DOM yet — open it and wait for the re-render before searching.
    if (topEntry.advanced && !this._advancedOpen) {
      this._setAdvancedOpen(true);
      await this.updateComplete;
    }

    // Make sure every parent NESTED group along the path is expanded
    // so the failing field is actually rendered.
    if (path.length > 1) {
      const next = new Set(this._nestedOpenSections);
      for (let i = 1; i < path.length; i++) {
        next.add(path.slice(0, i).join("."));
      }
      this._nestedOpenSections = next;
      await this.updateComplete;
    }

    const root = this.shadowRoot;
    if (!root) return;
    const container = root.querySelector(
      `[data-field-key="${CSS.escape(path.join("."))}"]`
    ) as HTMLElement | null;
    if (!container) return;

    container.scrollIntoView({ behavior: "smooth", block: "center" });
    // Focus the first focusable control so the user can fix it immediately
    // without an extra click. `preventScroll` keeps our smooth scroll intact.
    const focusable = container.querySelector<HTMLElement>(
      "input, select, textarea, wa-select, wa-switch, [tabindex]"
    );
    focusable?.focus({ preventScroll: true });
  }

  /**
   * Walk the entries in render order and return the first error target.
   * `topEntry` is the top-level entry under which the error sits (used
   * to decide whether to expand the Advanced section); `path` is the
   * dotted path of the actual leaf field with the error.
   */
  private _findFirstErrorTarget(
    entries: ConfigEntry[],
    errors: Map<string, ValidationError>,
    pathPrefix: string[],
  ): { topEntry: ConfigEntry; path: string[] } | null {
    for (const entry of entries) {
      const path = [...pathPrefix, entry.key];
      if (entry.type === ConfigEntryType.NESTED) {
        const found = this._findFirstErrorTarget(
          entry.config_entries ?? [],
          errors,
          path,
        );
        if (found) {
          return {
            topEntry: pathPrefix.length === 0 ? entry : found.topEntry,
            path: found.path,
          };
        }
        continue;
      }
      if (errors.has(path.join("."))) {
        return { topEntry: entry, path };
      }
    }
    return null;
  }

  private async _onSave() {
    if (!this._config) return;
    const errors = validateEntries(
      this._config.entries,
      this._values,
      this._presentComponents
    );
    if (errors.size > 0) {
      this._fieldErrors = errors;
      // Wait for the DOM to reflect the new error markers, then scroll the
      // first invalid field into view (no-op if it's already visible).
      await this.updateComplete;
      this._scrollFirstErrorIntoView(errors);
      return;
    }
    this._fieldErrors = new Map();
    this._saving = true;
    this._error = "";
    try {
      const yaml = await this._api.getConfig(this.configuration);
      const newYaml = this._updateSectionInYaml(yaml);
      const title = this._config.title;
      this._api.updateConfig(this.configuration, newYaml).catch((e) => {
        this._error =
          e instanceof Error ? e.message : this._localize("device.save_error");
      });
      this._dirty = false;
      this.dispatchEvent(
        new CustomEvent("yaml-updated", {
          detail: { yaml: newYaml },
          bubbles: true,
          composed: true,
        })
      );
      toast.success(this._localize("device.section_saved_toast", { title }), {
        richColors: true,
      });
    } catch (e) {
      this._error = e instanceof Error ? e.message : this._localize("device.save_error");
    } finally {
      this._saving = false;
    }
  }

  /** Replace the section's child values in the YAML with the form values.
   *
   *  The section is rewritten wholesale — we re-emit every form value at
   *  the correct indentation, including arrays and nested objects (recursive
   *  for the latter). This is simpler than trying to merge diffs and the
   *  schema-driven approach guarantees we never lose information.
   */
  private _updateSectionInYaml(yaml: string): string {
    const lines = yaml.split("\n");
    const { start, end } = this._findSectionRange(lines);
    if (start < 0) return yaml;

    const isListItem = /^\s+-\s/.test(lines[start]);
    const childIndent = isListItem ? "    " : "  ";

    const sectionHeader = lines[start];
    const newLines = [sectionHeader];
    newLines.push(...this._serializeValues(this._values, childIndent));

    lines.splice(start, end - start, ...newLines);
    return lines.join("\n");
  }

  /**
   * Recursively serialize a values dict as YAML lines at `indent`.
   * Skips empty values. Arrays render as block-style lists. Nested
   * objects recurse with `indent + "  "`.
   */
  private _serializeValues(
    values: Record<string, unknown>,
    indent: string,
  ): string[] {
    const lines: string[] = [];
    for (const [key, val] of Object.entries(values)) {
      if (val === undefined || val === null || val === "") continue;
      if (Array.isArray(val)) {
        if (val.length === 0) continue;
        lines.push(`${indent}${key}:`);
        for (const item of val) {
          lines.push(`${indent}  - ${this._formatScalar(item)}`);
        }
        continue;
      }
      if (typeof val === "object") {
        const sub = this._serializeValues(
          val as Record<string, unknown>,
          `${indent}  `,
        );
        if (sub.length === 0) continue;
        lines.push(`${indent}${key}:`);
        lines.push(...sub);
        continue;
      }
      lines.push(`${indent}${key}: ${this._formatScalar(val)}`);
    }
    return lines;
  }

  private _formatScalar(v: unknown): string {
    if (typeof v === "boolean") return String(v);
    if (typeof v === "number") return String(v);
    const s = String(v);
    // Quote when the string contains characters YAML would interpret —
    // spaces (alone are fine but most tooling quotes them), colons, or
    // leading dash/quote.
    if (/[:#]/.test(s) || /^[-\s'"]/.test(s) || /\s$/.test(s)) {
      return `"${s.replace(/"/g, '\\"')}"`;
    }
    return s;
  }

  /** Find the 0-indexed line range [start, end) for the current section. */
  private _findSectionRange(lines: string[]): { start: number; end: number } {
    let start = -1;
    if (this.fromLine !== undefined) {
      start = this.fromLine - 1;
    } else {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith(`${this.sectionKey}:`)) {
          start = i;
          break;
        }
      }
    }
    if (start < 0) return { start: -1, end: -1 };

    const isListItem = /^\s+-\s/.test(lines[start]);

    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      // For list items, stop at the next list item or top-level key
      if (isListItem) {
        if (/^\s+-\s/.test(lines[i]) || /^[a-zA-Z]/.test(lines[i])) {
          end = i;
          break;
        }
      } else {
        if (/^[a-zA-Z]/.test(lines[i])) {
          end = i;
          break;
        }
      }
    }
    return { start, end };
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-device-section-config": ESPHomeDeviceSectionConfig;
  }
}
