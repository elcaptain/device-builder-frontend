import { consume } from "@lit/context";
import { mdiContentSave, mdiHelpCircleOutline, mdiOpenInNew } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { ESPHomeAPI } from "../../api/index.js";
import type { ConfigEntry, SectionConfigResponse } from "../../api/types.js";
import { ConfigEntryType } from "../../api/types.js";
import type { LocalizeFunc } from "../../common/localize.js";
import { apiContext, localizeContext } from "../../context/index.js";
import { espHomeStyles } from "../../styles/shared.js";
import { registerMdiIcons } from "../../util/register-icons.js";

import "@home-assistant/webawesome/dist/components/divider/divider.js";
import "@home-assistant/webawesome/dist/components/icon/icon.js";
import "@home-assistant/webawesome/dist/components/input/input.js";
import "@home-assistant/webawesome/dist/components/option/option.js";
import "@home-assistant/webawesome/dist/components/select/select.js";
import "@home-assistant/webawesome/dist/components/spinner/spinner.js";
import "@home-assistant/webawesome/dist/components/switch/switch.js";

registerMdiIcons({
  "content-save": mdiContentSave,
  "help-circle-outline": mdiHelpCircleOutline,
  "open-in-new": mdiOpenInNew,
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

  @state()
  private _error = "";

  static styles = [
    espHomeStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        gap: var(--wa-space-m);
        margin-top: var(--wa-space-m);
      }

      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--wa-space-s);
      }

      .section-title {
        margin: 0;
        font-size: var(--wa-font-size-m);
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

      .field-description {
        font-size: var(--wa-font-size-2xs);
        color: var(--wa-color-text-quiet);
        margin: 0;
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
        border-top: 1px solid var(--wa-color-surface-border);
      }

      .save-button {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        border: none;
        background: var(--esphome-primary);
        color: var(--esphome-on-primary);
        padding: var(--wa-space-s) var(--wa-space-l);
        border-radius: var(--wa-border-radius-m);
        cursor: pointer;
        font-size: var(--wa-font-size-s);
        font-weight: var(--wa-font-weight-bold);
        font-family: inherit;
      }

      .save-button:hover {
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

      wa-input {
        width: 100%;
      }

      wa-select {
        width: 100%;
      }
    `,
  ];

  updated(changedProperties: Map<string, unknown>) {
    if (
      (changedProperties.has("sectionKey") || changedProperties.has("configuration")) &&
      this.sectionKey &&
      this.configuration
    ) {
      this._loadConfig();
    }
  }

  private async _loadConfig() {
    this._loading = true;
    this._error = "";
    this._dirty = false;
    try {
      this._config = await this._api.getSectionConfig(
        this.configuration,
        this.sectionKey
      );
      // Initialize values from entries
      const values: Record<string, unknown> = {};
      for (const entry of this._config.entries) {
        if (
          entry.hidden ||
          entry.type === ConfigEntryType.LABEL ||
          entry.type === ConfigEntryType.DIVIDER ||
          entry.type === ConfigEntryType.ALERT
        ) {
          continue;
        }
        values[entry.key] = entry.value ?? entry.default_value ?? "";
      }
      this._values = values;
    } catch (err) {
      this._error = err instanceof Error ? err.message : "Failed to load section config";
    } finally {
      this._loading = false;
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

    const visibleEntries = this._config.entries.filter((e) => !e.hidden);

    return html`
      <div class="section-header">
        <h3 class="section-title">${this._config.title}</h3>
        <a
          class="docs-link"
          href=${this._config.docs_url}
          target="_blank"
          rel="noreferrer"
        >
          ${this._localize("device.docs")}
          <wa-icon library="mdi" name="open-in-new"></wa-icon>
        </a>
      </div>
      <p class="section-desc">${this._config.description}</p>
      <div class="form">${visibleEntries.map((entry) => this._renderEntry(entry))}</div>
      ${this._error ? html`<p class="error">${this._error}</p>` : nothing}
      <div class="actions">
        <button
          class="save-button"
          ?disabled=${this._saving || !this._dirty}
          @click=${this._onSave}
        >
          <wa-icon library="mdi" name="content-save"></wa-icon>
          ${this._saving ? "Saving…" : this._localize("device.save")}
        </button>
      </div>
    `;
  }

  private _renderEntry(entry: ConfigEntry) {
    switch (entry.type) {
      case ConfigEntryType.DIVIDER:
        return html`<wa-divider></wa-divider>`;

      case ConfigEntryType.LABEL:
        return html`<p class="label-entry">${entry.label}</p>`;

      case ConfigEntryType.ALERT:
        return html`<div class="alert-entry">${entry.label}</div>`;

      case ConfigEntryType.BOOLEAN:
        return this._renderBooleanField(entry);

      case ConfigEntryType.SELECT:
        return this._renderSelectField(entry);

      case ConfigEntryType.SECURE_STRING:
        return this._renderStringField(entry, "password");

      case ConfigEntryType.INTEGER:
        return this._renderNumberField(entry);

      case ConfigEntryType.FLOAT:
        return this._renderNumberField(entry);

      case ConfigEntryType.ICON:
        return this._renderStringField(entry, "text");

      case ConfigEntryType.STRING:
      default:
        return this._renderStringField(entry, "text");
    }
  }

  private _renderStringField(entry: ConfigEntry, inputType: string) {
    const value = String(this._values[entry.key] ?? "");
    return html`
      <div class="field">
        <label class="field-label">
          ${entry.label}
          ${entry.required ? html`<span class="required">*</span>` : nothing}
        </label>
        ${entry.description
          ? html`<p class="field-description">${entry.description}</p>`
          : nothing}
        <wa-input
          type=${inputType}
          .value=${value}
          placeholder=${String(entry.default_value ?? "")}
          @input=${(e: Event) =>
            this._setValue(entry.key, (e.target as HTMLInputElement).value)}
        ></wa-input>
      </div>
    `;
  }

  private _renderNumberField(entry: ConfigEntry) {
    const value = String(this._values[entry.key] ?? "");
    return html`
      <div class="field">
        <label class="field-label">
          ${entry.label}
          ${entry.required ? html`<span class="required">*</span>` : nothing}
        </label>
        ${entry.description
          ? html`<p class="field-description">${entry.description}</p>`
          : nothing}
        <wa-input
          type="number"
          .value=${value}
          placeholder=${String(entry.default_value ?? "")}
          @input=${(e: Event) => {
            const raw = (e.target as HTMLInputElement).value;
            this._setValue(entry.key, raw === "" ? "" : Number(raw));
          }}
        ></wa-input>
      </div>
    `;
  }

  private _renderBooleanField(entry: ConfigEntry) {
    const checked =
      this._values[entry.key] === true || this._values[entry.key] === "true";
    return html`
      <div class="switch-field">
        <div class="field-info">
          <label class="field-label">${entry.label}</label>
          ${entry.description
            ? html`<p class="field-description">${entry.description}</p>`
            : nothing}
        </div>
        <wa-switch
          ?checked=${checked}
          @change=${(e: Event) =>
            this._setValue(
              entry.key,
              (e.target as HTMLInputElement & { checked: boolean }).checked
            )}
        ></wa-switch>
      </div>
    `;
  }

  private _renderSelectField(entry: ConfigEntry) {
    const value = String(this._values[entry.key] ?? "");
    return html`
      <div class="field">
        <label class="field-label">
          ${entry.label}
          ${entry.required ? html`<span class="required">*</span>` : nothing}
        </label>
        ${entry.description
          ? html`<p class="field-description">${entry.description}</p>`
          : nothing}
        <wa-select
          .value=${value}
          @change=${(e: Event) =>
            this._setValue(entry.key, (e.target as HTMLSelectElement).value)}
        >
          ${(entry.options ?? []).map(
            (opt) => html`<wa-option value=${opt.value}>${opt.label}</wa-option>`
          )}
        </wa-select>
      </div>
    `;
  }

  private _setValue(key: string, value: unknown) {
    this._values = { ...this._values, [key]: value };
    this._dirty = true;
  }

  private async _onSave() {
    if (!this._config || this._saving) return;
    this._saving = true;
    this._error = "";
    try {
      // Filter out empty optional values and internal keys
      const valuesToSave: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(this._values)) {
        if (key.startsWith("_")) continue;
        const entry = this._config.entries.find((e) => e.key === key);
        if (!entry) continue;
        // Skip empty non-required fields
        if (!entry.required && (val === "" || val === null || val === undefined))
          continue;
        valuesToSave[key] = val;
      }

      const { yaml } = await this._api.updateSectionConfig(this.configuration, {
        section_key: this._config.section_key,
        values: valuesToSave,
      });

      this._dirty = false;

      // Notify parent of YAML update
      this.dispatchEvent(
        new CustomEvent("yaml-updated", {
          detail: { yaml },
          bubbles: true,
          composed: true,
        })
      );
    } catch (err) {
      this._error = err instanceof Error ? err.message : "Failed to save";
    } finally {
      this._saving = false;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-device-section-config": ESPHomeDeviceSectionConfig;
  }
}
