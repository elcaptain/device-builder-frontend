import { consume } from "@lit/context";
import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { ComponentCatalogEntry, ConfigEntry } from "../../api/types.js";
import { ConfigEntryType } from "../../api/types.js";
import type { LocalizeFunc } from "../../common/localize.js";
import { localizeContext } from "../../context/index.js";
import { inputStyles } from "../../styles/inputs.js";
import { espHomeStyles } from "../../styles/shared.js";
import {
  validateEntries,
  type ValidationError,
} from "../../util/config-validation.js";
import { setIn } from "../../util/nested-values.js";
import { serializeYamlValues } from "../../util/yaml-serialize.js";
import { addComponentFormStyles } from "./add-component-form.styles.js";
import "./config-entry-form.js";
import type { ConfigEntryValueChange } from "./config-entry-form.js";

@customElement("esphome-add-component-form")
export class ESPHomeAddComponentForm extends LitElement {
  @consume({ context: localizeContext, subscribe: true })
  @state()
  private _localize: LocalizeFunc = (key) => key;

  @property({ attribute: false })
  component!: ComponentCatalogEntry;

  @property({ type: Boolean })
  submitting = false;

  @property()
  submitError = "";

  @state()
  private _values: Record<string, unknown> = {};

  @state()
  private _errors: Map<string, ValidationError> = new Map();

  @state()
  private _showYaml = false;

  static styles = [espHomeStyles, inputStyles, addComponentFormStyles];

  connectedCallback(): void {
    super.connectedCallback();
    // Seed initial values from `default_value` on every required entry
    // (recursively into NESTED groups). Non-required leaves are left
    // out of `_values` so they don't end up serialised when empty.
    this._values = this._seedDefaults(this.component.config_entries);

    // Auto-generate a sensible default for the top-level `id` field
    // when present. Format: <domain>_<platform> (with dots in
    // component.id replaced by underscores). Multi-conf components
    // get a numbered suffix the user can bump.
    const idEntry = this.component.config_entries.find(
      (e) => e.key === "id" && e.type === ConfigEntryType.ID,
    );
    if (idEntry && this._values["id"] === undefined) {
      this._values = { ...this._values, id: this._generateDefaultId() };
    }
  }

  /**
   * Seed initial form values. We're showing only required fields, so
   * we only pre-fill required fields' defaults — pre-filling optional
   * fields the user can't see would just bloat the payload with
   * values they never explicitly chose. NESTED entries recurse
   * regardless of whether the parent is required, since a non-required
   * group can still contain required descendants we want to seed.
   */
  private _seedDefaults(entries: ConfigEntry[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const entry of entries) {
      if (entry.type === ConfigEntryType.NESTED) {
        const sub = this._seedDefaults(entry.config_entries ?? []);
        if (Object.keys(sub).length > 0) out[entry.key] = sub;
        continue;
      }
      if (!entry.required) continue;
      if (entry.default_value != null) {
        out[entry.key] = entry.multi_value
          ? [String(entry.default_value)]
          : entry.default_value;
      } else if (entry.multi_value) {
        out[entry.key] = [];
      }
    }
    return out;
  }

  private _generateDefaultId(): string {
    // "switch.gpio" -> "switch_gpio"; "wifi" -> "wifi"
    const slug = this.component.id.replace(/\./g, "_").toLowerCase();
    return this.component.multi_conf ? `${slug}_1` : slug;
  }

  protected render() {
    const disabled = this.submitting;
    // The shared form filters its own visibility — but we still need
    // to know whether everything required is filled in to enable the
    // submit button. Run validation against the current values; if
    // any required errors come back, the form is incomplete.
    const validation = validateEntries(
      this.component.config_entries,
      this._values,
    );
    const isComplete = !this._hasRequiredErrors(validation);

    return html`
      <div class="form">
        <p class="form-desc">${this.component.description}</p>
        <esphome-config-entry-form
          .entries=${this.component.config_entries}
          .values=${this._values}
          .errors=${this._errors}
          ?disabled=${disabled}
          ?required-only=${true}
          @value-change=${this._onValueChange}
        ></esphome-config-entry-form>
        <button
          type="button"
          class="toggle-link"
          @click=${() => {
            this._showYaml = !this._showYaml;
          }}
        >
          ${this._showYaml
            ? this._localize("device.yaml_preview_toggle")
            : this._localize("device.yaml_preview")}
        </button>
        ${this._showYaml
          ? html`<pre class="yaml-preview">${this._generateYamlPreview()}</pre>`
          : nothing}
        ${this.submitError
          ? html`<p class="error">${this.submitError}</p>`
          : nothing}
        <div class="actions">
          <button
            class="btn btn-secondary"
            ?disabled=${disabled}
            @click=${this._onCancel}
          >
            ${this._localize("wizard.back")}
          </button>
          <button
            class="btn btn-primary"
            ?disabled=${disabled || !isComplete}
            @click=${this._onSubmit}
          >
            ${this.submitting
              ? this._localize("device.adding")
              : this._localize("device.add_component_action")}
          </button>
        </div>
      </div>
    `;
  }

  /** True if any error in the map has the `validation.required` code. */
  private _hasRequiredErrors(errors: Map<string, ValidationError>): boolean {
    for (const e of errors.values()) {
      if (e.code === "validation.required") return true;
    }
    return false;
  }

  private _onValueChange(e: CustomEvent<ConfigEntryValueChange>) {
    const { path, value } = e.detail;
    this._values = setIn(this._values, path, value);
    // Clear any error on the path the user just edited so the
    // red ring disappears as they type.
    const errKey = path.join(".");
    if (this._errors.has(errKey)) {
      const next = new Map(this._errors);
      next.delete(errKey);
      this._errors = next;
    }
  }

  private _generateYamlPreview(): string {
    const lines: string[] = [`${this.component.id}:`];
    lines.push(...serializeYamlValues(this._values, "  "));
    return lines.join("\n");
  }

  private _onCancel() {
    this.dispatchEvent(
      new CustomEvent("form-cancel", { bubbles: true, composed: true }),
    );
  }

  private _onSubmit() {
    // Validate the entire schema. If anything fails, surface the
    // errors inline (the shared form will pick them up by path).
    const errors = validateEntries(
      this.component.config_entries,
      this._values,
    );
    if (errors.size > 0) {
      this._errors = errors;
      return;
    }
    this._errors = new Map();

    // Coerce the values dict for the API: strip empties so we don't
    // send blank optional fields, and recurse through nested objects
    // and arrays unchanged (the backend handles structured payloads).
    const fields = this._coerceFields(
      this.component.config_entries,
      this._values,
    );

    this.dispatchEvent(
      new CustomEvent("form-submit", {
        detail: { fields },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Convert raw form values into the API payload. Drops empty strings
   * (unless the entry is required), keeps arrays as-is, and recurses
   * through NESTED groups. Numeric / boolean entries are coerced to
   * their proper types so the backend sees `5` not `"5"`.
   */
  private _coerceFields(
    entries: ConfigEntry[],
    values: Record<string, unknown>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const entry of entries) {
      if (entry.hidden) continue;
      const raw = values[entry.key];

      if (entry.type === ConfigEntryType.NESTED) {
        const childValues =
          raw !== null && typeof raw === "object" && !Array.isArray(raw)
            ? (raw as Record<string, unknown>)
            : {};
        const sub = this._coerceFields(
          entry.config_entries ?? [],
          childValues,
        );
        if (Object.keys(sub).length > 0) out[entry.key] = sub;
        continue;
      }

      if (raw === undefined) continue;
      if (Array.isArray(raw)) {
        if (raw.length === 0) continue;
        out[entry.key] = raw;
        continue;
      }
      if (raw === "") {
        if (entry.required) out[entry.key] = raw;
        continue;
      }

      if (entry.type === ConfigEntryType.INTEGER) {
        const n = typeof raw === "number" ? raw : Number.parseInt(String(raw), 10);
        if (!Number.isNaN(n)) out[entry.key] = n;
      } else if (entry.type === ConfigEntryType.FLOAT) {
        const n =
          typeof raw === "number" ? raw : Number.parseFloat(String(raw));
        if (!Number.isNaN(n)) out[entry.key] = n;
      } else if (entry.type === ConfigEntryType.BOOLEAN) {
        out[entry.key] = raw === true || raw === "true";
      } else {
        out[entry.key] = raw;
      }
    }
    return out;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-add-component-form": ESPHomeAddComponentForm;
  }
}
