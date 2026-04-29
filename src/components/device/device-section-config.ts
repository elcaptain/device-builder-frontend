import { consume } from "@lit/context";
import { mdiContentSave, mdiOpenInNew } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import toast from "sonner-js";
import type { ESPHomeAPI } from "../../api/index.js";
import type { BoardCatalogEntry, ConfigEntry } from "../../api/types.js";
import { ConfigEntryType } from "../../api/types.js";
import type { LocalizeFunc } from "../../common/localize.js";
import { apiContext, localizeContext } from "../../context/index.js";
import { inputStyles } from "../../styles/inputs.js";
import { espHomeStyles } from "../../styles/shared.js";
import {
  validateEntries,
  type ValidationError,
} from "../../util/config-validation.js";
import { setIn } from "../../util/nested-values.js";
import { registerMdiIcons } from "../../util/register-icons.js";
import { serializeYamlValues } from "../../util/yaml-serialize.js";

import "@home-assistant/webawesome/dist/components/icon/icon.js";
import "@home-assistant/webawesome/dist/components/spinner/spinner.js";
import "@home-assistant/webawesome/dist/components/switch/switch.js";
import "./config-entry-form.js";
import type {
  ConfigEntryValueChange,
  ESPHomeConfigEntryForm,
} from "./config-entry-form.js";

registerMdiIcons({
  "content-save": mdiContentSave,
  "open-in-new": mdiOpenInNew,
});

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

  /** Optional board metadata; used by the embedded form for PIN selectors. */
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

  /** Section keys for which the user has flipped on "Show advanced
   *  settings". Per-section so switching components doesn't bleed state. */
  @state()
  private _advancedShownSections = new Set<string>();

  private get _showAdvanced(): boolean {
    return this._advancedShownSections.has(this.sectionKey);
  }

  private _setShowAdvanced(show: boolean) {
    const next = new Set(this._advancedShownSections);
    if (show) next.add(this.sectionKey);
    else next.delete(this.sectionKey);
    this._advancedShownSections = next;
  }

  /** Top-level component keys present in the YAML (drives
   *  `depends_on_component` predicates). */
  @state()
  private _presentComponents: Set<string> = new Set();

  /** Full YAML — needed by the embedded form for ID / pin lookups. */
  @state()
  private _yaml = "";

  @query("esphome-config-entry-form")
  private _form?: ESPHomeConfigEntryForm;

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

      esphome-config-entry-form {
        display: flex;
        flex-direction: column;
        gap: var(--wa-space-m);
      }

      /* "Show advanced settings" toggle row, shown below the form when
         the section has any advanced entries (at any depth). */
      .advanced-toggle-row {
        display: flex;
        justify-content: flex-start;
        margin-top: var(--wa-space-s);
        font-size: var(--wa-font-size-s);
      }

      .advanced-toggle-row wa-switch {
        font-weight: var(--wa-font-weight-semibold);
        color: var(--wa-color-text-quiet);
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
      const platform = this.board?.esphome.platform;
      const component = await this._api.getComponent(this.sectionKey, platform);

      if (id !== this._loadId) return;

      if (!component) {
        this._error = this._localize("device.unknown_section", {
          key: this.sectionKey,
        });
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
      this._error = msg.includes("timed out")
        ? this._localize("device.load_config_error")
        : msg || this._localize("device.load_config_error");
    } finally {
      if (id === this._loadId) {
        this._loading = false;
      }
    }
  }

  /** Set of top-level component keys configured in the YAML. */
  private _parseTopLevelComponents(yaml: string): Set<string> {
    const present = new Set<string>();
    for (const line of yaml.split("\n")) {
      const match = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
      if (match) present.add(match[1]);
    }
    return present;
  }

  /**
   * Parse simple key: value pairs from the YAML section at the current
   * fromLine. Recurses into nested objects and handles block lists.
   */
  private _parseYamlSectionValues(yaml: string): Record<string, unknown> {
    const lines = yaml.split("\n");
    const values: Record<string, unknown> = {};

    let startIdx = -1;
    if (this.fromLine !== undefined) {
      startIdx = this.fromLine - 1;
    } else {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith(`${this.sectionKey}:`)) {
          startIdx = i;
          break;
        }
      }
    }
    if (startIdx < 0) return values;

    const isListItem = /^\s+-\s/.test(lines[startIdx]);
    const childIndent = isListItem ? "    " : "  ";
    const childRegex = new RegExp(
      `^${childIndent}([a-zA-Z_][a-zA-Z0-9_]*):\\s*(.*)$`,
    );

    if (isListItem) {
      const firstMatch = lines[startIdx].match(
        /^\s+-\s+([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/,
      );
      if (firstMatch) {
        const key = firstMatch[1];
        let raw = firstMatch[2].trim();
        if (raw !== "") {
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
      }
    }

    const listItemIndent = `${childIndent}  - `;
    const listItemRegex = new RegExp(`^${childIndent}  -\\s+(.*)$`);

    for (let i = startIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === "") continue;
      if (isListItem) {
        if (/^\s+-\s/.test(line) || /^[a-zA-Z]/.test(line)) break;
      } else {
        if (/^[a-zA-Z]/.test(line)) break;
      }

      const match = line.match(childRegex);
      if (!match) continue;

      const key = match[1];
      let raw = match[2].trim();

      if (raw === "") {
        let peek = i + 1;
        while (peek < lines.length && lines[peek].trim() === "") peek++;
        if (peek >= lines.length) continue;
        const peekLine = lines[peek];

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

      if (raw.startsWith("[") && raw.endsWith("]")) {
        const inner = raw.slice(1, -1).trim();
        const items =
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

  /** Recursively parse a nested YAML block at the given indent. */
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
    if (
      img.src !== window.location.origin + fallback &&
      !img.src.endsWith(fallback)
    ) {
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

    const showAdvanced = this._showAdvanced;
    const hasAdvanced = this._anyAdvancedEntry(this._config.entries);

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
      <esphome-config-entry-form
        .entries=${this._config.entries}
        .values=${this._values}
        .errors=${this._fieldErrors}
        .board=${this.board}
        .yaml=${this._yaml}
        .fromLine=${this.fromLine}
        .presentComponents=${this._presentComponents}
        ?disabled=${this._saving}
        ?show-advanced=${showAdvanced}
        @value-change=${this._onValueChange}
      ></esphome-config-entry-form>
      ${hasAdvanced
        ? html`<div class="advanced-toggle-row">
            <wa-switch
              ?checked=${showAdvanced}
              @change=${(e: Event) =>
                this._setShowAdvanced(
                  (e.target as HTMLInputElement & { checked: boolean }).checked,
                )}
            >
              ${this._localize("device.show_advanced")}
            </wa-switch>
          </div>`
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

  /** True when `entries` contains any advanced entry, recursively. */
  private _anyAdvancedEntry(entries: ConfigEntry[]): boolean {
    for (const entry of entries) {
      if (entry.advanced) return true;
      if (entry.type === ConfigEntryType.NESTED) {
        if (this._anyAdvancedEntry(entry.config_entries ?? [])) return true;
      }
    }
    return false;
  }

  private _onValueChange(e: CustomEvent<ConfigEntryValueChange>) {
    const { path, value } = e.detail;
    this._values = setIn(this._values, path, value);
    this._dirty = true;
    const errKey = path.join(".");
    if (this._fieldErrors.has(errKey)) {
      const next = new Map(this._fieldErrors);
      next.delete(errKey);
      this._fieldErrors = next;
    }
  }

  private async _scrollFirstErrorIntoView(
    errors: Map<string, ValidationError>,
  ) {
    if (!this._config) return;

    const firstHit = this._findFirstErrorTarget(this._config.entries, errors, []);
    if (!firstHit) return;
    const { path, hasAdvancedAncestor } = firstHit;

    if (hasAdvancedAncestor && !this._showAdvanced) {
      this._setShowAdvanced(true);
      await this.updateComplete;
    }

    // Open every parent NESTED group on the form so the failing field
    // is actually rendered when we go to find it.
    if (path.length > 1) {
      for (let i = 1; i < path.length; i++) {
        this._form?.openNested(path.slice(0, i).join("."));
      }
      await this.updateComplete;
      await this._form?.updateComplete;
    }

    const root = this._form?.shadowRoot;
    if (!root) return;
    const container = root.querySelector(
      `[data-field-key="${CSS.escape(path.join("."))}"]`,
    ) as HTMLElement | null;
    if (!container) return;

    container.scrollIntoView({ behavior: "smooth", block: "center" });
    const focusable = container.querySelector<HTMLElement>(
      "input, select, textarea, wa-select, wa-switch, [tabindex]",
    );
    focusable?.focus({ preventScroll: true });
  }

  /**
   * Walk the entries in render order and return the first error target.
   * `path` is the dotted path of the failing leaf field;
   * `hasAdvancedAncestor` is true when the leaf itself or any
   * NESTED entry along the way is `advanced`.
   */
  private _findFirstErrorTarget(
    entries: ConfigEntry[],
    errors: Map<string, ValidationError>,
    pathPrefix: string[],
    ancestorAdvanced = false,
  ): { path: string[]; hasAdvancedAncestor: boolean } | null {
    for (const entry of entries) {
      const path = [...pathPrefix, entry.key];
      const advancedHere = ancestorAdvanced || entry.advanced;
      if (entry.type === ConfigEntryType.NESTED) {
        const found = this._findFirstErrorTarget(
          entry.config_entries ?? [],
          errors,
          path,
          advancedHere,
        );
        if (found) return found;
        continue;
      }
      if (errors.has(path.join("."))) {
        return { path, hasAdvancedAncestor: advancedHere };
      }
    }
    return null;
  }

  private async _onSave() {
    if (!this._config) return;
    const errors = validateEntries(
      this._config.entries,
      this._values,
      this._presentComponents,
    );
    if (errors.size > 0) {
      this._fieldErrors = errors;
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
        }),
      );
      toast.success(this._localize("device.section_saved_toast", { title }), {
        richColors: true,
      });
    } catch (e) {
      this._error =
        e instanceof Error ? e.message : this._localize("device.save_error");
    } finally {
      this._saving = false;
    }
  }

  /** Replace the section's child values in the YAML with the form values. */
  private _updateSectionInYaml(yaml: string): string {
    const lines = yaml.split("\n");
    const { start, end } = this._findSectionRange(lines);
    if (start < 0) return yaml;

    const isListItem = /^\s+-\s/.test(lines[start]);
    const childIndent = isListItem ? "    " : "  ";

    const sectionHeader = lines[start];
    const newLines = [sectionHeader];
    newLines.push(...serializeYamlValues(this._values, childIndent));

    lines.splice(start, end - start, ...newLines);
    return lines.join("\n");
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
