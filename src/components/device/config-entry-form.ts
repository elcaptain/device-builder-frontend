/**
 * Shared form renderer for ConfigEntry schemas.
 *
 * Both the device section editor (`device-section-config.ts`) and the
 * "Add component" dialog (`add-component-form.ts`) point this element
 * at an array of ConfigEntry's; it handles dispatching to the right UI
 * for every entry type (string/number/boolean/select/combobox/pin/
 * id-reference/icon/textarea/multi-value/nested) and supports recursive
 * nested groups.
 *
 * The form is fully controlled — the owner passes `values` + `errors`
 * in, listens for `value-change` events, and merges the change back
 * into its own state. That keeps the form free of any persistence
 * concerns and lets each owner decide what "save" / "submit" means.
 */
import { consume } from "@lit/context";
import {
  mdiAlertCircleOutline,
  mdiChevronDown,
  mdiChevronUp,
  mdiClose,
  mdiOpenInNew,
  mdiPlus,
} from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { BoardCatalogEntry, BoardPin, ConfigEntry } from "../../api/types.js";
import { ConfigEntryType, PinFeature, PinMode } from "../../api/types.js";
import type { LocalizeFunc } from "../../common/localize.js";
import { localizeContext } from "../../context/index.js";
import { inputStyles } from "../../styles/inputs.js";
import { espHomeStyles } from "../../styles/shared.js";
import { isEntryVisible, type ValidationError } from "../../util/config-validation.js";
import { getIn } from "../../util/nested-values.js";
import { registerMdiIcons } from "../../util/register-icons.js";

import "@home-assistant/webawesome/dist/components/divider/divider.js";
import "@home-assistant/webawesome/dist/components/icon/icon.js";
import "@home-assistant/webawesome/dist/components/option/option.js";
import "@home-assistant/webawesome/dist/components/select/select.js";
import "@home-assistant/webawesome/dist/components/switch/switch.js";
import "../mdi-icon-picker.js";

registerMdiIcons({
  "alert-circle-outline": mdiAlertCircleOutline,
  "chevron-down": mdiChevronDown,
  "chevron-up": mdiChevronUp,
  close: mdiClose,
  "open-in-new": mdiOpenInNew,
  plus: mdiPlus,
});

/** Detail emitted with `value-change` events. */
export interface ConfigEntryValueChange {
  path: string[];
  value: unknown;
}

/**
 * Entry keys that the form keeps visible even when `requiredOnly` is
 * on. `name` becomes the entity's friendly name in Home Assistant, so
 * even though most schemas mark it optional we want to ask for it
 * up-front when the user is creating something — fewer trips back to
 * the section editor for a label they always want.
 */
const ALWAYS_SHOWN_KEYS: Set<string> = new Set(["name"]);

@customElement("esphome-config-entry-form")
export class ESPHomeConfigEntryForm extends LitElement {
  @consume({ context: localizeContext, subscribe: true })
  @state()
  private _localize: LocalizeFunc = (key) => key;

  /** Schema entries to render (recursive — NESTED entries contain
   *  their own `config_entries`). */
  @property({ attribute: false })
  entries: ConfigEntry[] = [];

  /** Current form values keyed by entry key (nested as sub-objects).
   *  Owner-controlled — emits `value-change` to mutate. */
  @property({ attribute: false })
  values: Record<string, unknown> = {};

  /** Validation errors keyed by dotted path. */
  @property({ attribute: false })
  errors: Map<string, ValidationError> = new Map();

  /** Board metadata, used by the GPIO pin selector. */
  @property({ attribute: false })
  board: BoardCatalogEntry | null = null;

  /** Disable all inputs (e.g. while saving / submitting). */
  @property({ type: Boolean })
  disabled = false;

  /** Show advanced fields. Owner is in charge of any toggle UI; the
   *  form just respects the flag. */
  @property({ type: Boolean, attribute: "show-advanced" })
  showAdvanced = false;

  /** Show only required entries (recursively into nested groups).
   *  Used by the add-component dialog so the user only fills the
   *  must-have fields up front. */
  @property({ type: Boolean, attribute: "required-only" })
  requiredOnly = false;

  /** Full device YAML — used by the ID reference picker (to discover
   *  existing components) and pin conflict detection. */
  @property()
  yaml = "";

  /** Section's start line in the YAML; used to skip the user's own
   *  pin from conflict detection. */
  @property({ type: Number, attribute: "from-line" })
  fromLine?: number;

  /** Top-level component keys present in the YAML — drives the
   *  `depends_on_component` visibility predicate. */
  @property({ attribute: false })
  presentComponents: Set<string> = new Set();

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

      /* ─── Nested group ──────────────────────────────────────── */
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

      /* ─── multi-value rows ──────────────────────────────────── */
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
        transition:
          border-color 0.12s,
          box-shadow 0.12s;
      }

      .multi-row .multi-input:focus {
        border-color: var(--esphome-primary);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--esphome-primary), transparent 80%);
      }

      .multi-row .multi-input.invalid {
        border-color: var(--esphome-error);
      }

      .multi-row .multi-input:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

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
        transition:
          border-color 0.12s,
          box-shadow 0.12s;
      }

      .combobox-input:focus {
        border-color: var(--esphome-primary);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--esphome-primary), transparent 80%);
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

      /* ─── Pin selector option layout ─────────────────────────── */
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
        display: inline-flex;
        align-items: center;
        gap: 4px;
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

      .pin-warn-icon {
        color: var(--esphome-warning, #d97706);
        font-size: 14px;
        flex-shrink: 0;
      }

      .pin-option--warn .pin-option-secondary {
        color: var(--esphome-warning, #d97706);
        font-style: normal;
      }

      /* ─── ID reference picker option layout ──────────────────── */
      .id-option-stack {
        display: inline-flex;
        flex-direction: column;
        gap: 1px;
        line-height: 1.25;
      }

      /* Visually distinguish the "Add new …" entry at the bottom of
         the dropdown — same pattern as Home Assistant's entity
         pickers. Coloured to read as an action, not a value. */
      .id-option-add {
        border-top: var(--wa-border-width-s) solid var(--wa-color-surface-border);
        margin-top: var(--wa-space-2xs);
      }

      .id-option-add--solo {
        border-top: none;
        margin-top: 0;
      }

      .id-option-primary-add {
        color: var(--esphome-primary);
        font-weight: var(--wa-font-weight-bold);
      }

      .id-option-primary-add wa-icon {
        font-size: 14px;
      }

      .id-option-primary {
        font-size: var(--wa-font-size-s);
        font-weight: var(--wa-font-weight-semibold);
        color: var(--wa-color-text-normal);
        display: inline-flex;
        align-items: center;
        gap: 4px;
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

      wa-select {
        width: 100%;
      }
    `,
  ];

  /**
   * Filter `entries` for rendering: hidden + dependency-failing entries
   * always go away; advanced entries go away unless `showAdvanced` is
   * on; in `requiredOnly` mode, non-required leaves go away too. NESTED
   * entries stay only if anything inside them is renderable, so an
   * empty header never sits in the form.
   */
  private _filterRenderable(
    entries: ConfigEntry[],
    values: Record<string, unknown>
  ): ConfigEntry[] {
    const out: ConfigEntry[] = [];
    for (const entry of entries) {
      if (!isEntryVisible(entry, values, this.presentComponents)) continue;
      if (entry.advanced && !this.showAdvanced) continue;
      if (entry.type === ConfigEntryType.NESTED) {
        const childList = entry.config_entries ?? [];
        const childValues = this._scopeValues([entry.key]);
        const renderableChildren = this._filterRenderable(childList, childValues);
        if (renderableChildren.length === 0) continue;
      } else if (
        this.requiredOnly &&
        !entry.required &&
        !ALWAYS_SHOWN_KEYS.has(entry.key)
      ) {
        // In required-only mode, drop optional leaves outright unless
        // they're on the always-shown allowlist (e.g. `name`, which is
        // optional but worth asking up-front for sensors/switches/lights).
        continue;
      }
      out.push(entry);
    }
    return out;
  }

  protected render() {
    const visible = this._filterRenderable(this.entries, this.values);
    return html`${visible.map((entry) => this._renderEntry(entry, [entry.key]))}`;
  }

  // ─── Entry dispatch ─────────────────────────────────────────────

  private _renderEntry(entry: ConfigEntry, path: string[]) {
    if (entry.type === ConfigEntryType.DIVIDER) {
      return html`<wa-divider></wa-divider>`;
    }
    if (entry.type === ConfigEntryType.LABEL) {
      return html`<p class="label-entry">${this._labelFor(entry)}</p>`;
    }
    if (entry.type === ConfigEntryType.ALERT) {
      return html`<div class="alert-entry">${this._labelFor(entry)}</div>`;
    }
    if (entry.type === ConfigEntryType.NESTED) {
      return this._renderNestedField(entry, path);
    }
    if (entry.multi_value) {
      return this._renderMultiValueField(entry, path);
    }
    // Any entry that points at another component renders as the ID
    // picker dropdown — `references_component` is the explicit
    // "this references another component" signal, independent of the
    // underlying type. (A binary light's `output:` field, for example,
    // is a STRING with `references_component: "output"`.)
    if (entry.references_component) {
      return this._renderIdReferenceField(entry, path);
    }
    if (entry.options && entry.options.length > 0) {
      return this._renderSelectField(entry, path);
    }
    switch (entry.type) {
      case ConfigEntryType.BOOLEAN:
        return this._renderBooleanField(entry, path);
      case ConfigEntryType.SELECT:
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
      case ConfigEntryType.ICON:
        return this._renderIconField(entry, path);
      default:
        return this._renderStringField(entry, "text", path);
    }
  }

  // ─── Renderers ──────────────────────────────────────────────────

  private _renderNestedField(entry: ConfigEntry, path: string[]) {
    const key = path.join(".");
    // In `requiredOnly` mode (the add-component dialog) groups default
    // to expanded so the user immediately sees the required fields they
    // need to fill — and the set tracks which groups they've explicitly
    // collapsed. In normal mode (section editor) groups default to
    // collapsed and the set tracks which are explicitly open.
    const inSet = this._nestedOpenSections.has(key);
    const isOpen = this.requiredOnly ? !inSet : inSet;
    const renderableChildren = this._filterRenderable(
      entry.config_entries ?? [],
      this._scopeValues(path)
    );
    return html`
      <div class="nested-group" data-field-key=${path.join(".")}>
        <button
          type="button"
          class="nested-toggle"
          @click=${() => this._toggleNested(path.join("."))}
        >
          <wa-icon library="mdi" name=${isOpen ? "chevron-up" : "chevron-down"}></wa-icon>
          <span class="nested-title">${this._labelFor(entry)}</span>
          ${entry.platform_type
            ? html`<span class="nested-platform">${entry.platform_type}</span>`
            : nothing}
        </button>
        ${isOpen
          ? html`<div class="nested-fields">
              ${renderableChildren.map((child) =>
                this._renderEntry(child, [...path, child.key])
              )}
            </div>`
          : nothing}
      </div>
    `;
  }

  private _renderStringField(entry: ConfigEntry, inputType: string, path: string[]) {
    const value = String(this._getAt(path) ?? "");
    const invalid = this._errorAt(path) !== null;
    return html`
      <div class="field" data-field-key=${path.join(".")}>
        ${this._renderLabel(entry)}
        <input
          type=${inputType}
          class=${invalid ? "invalid" : ""}
          .value=${value}
          ?disabled=${this.disabled}
          placeholder=${String(entry.default_value ?? "")}
          @input=${(e: Event) =>
            this._emitChange(path, (e.target as HTMLInputElement).value)}
        />
        ${this._fieldErrorAt(path)}
      </div>
    `;
  }

  private _renderNumberField(entry: ConfigEntry, path: string[]) {
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
          ?disabled=${this.disabled}
          min=${min ?? ""}
          max=${max ?? ""}
          step=${entry.type === ConfigEntryType.FLOAT ? "any" : "1"}
          placeholder=${String(entry.default_value ?? "")}
          @input=${(e: Event) => {
            const raw = (e.target as HTMLInputElement).value;
            this._emitChange(path, raw === "" ? "" : Number(raw));
          }}
        />
        ${this._fieldErrorAt(path)}
      </div>
    `;
  }

  private _renderBooleanField(entry: ConfigEntry, path: string[]) {
    const raw = this._getAt(path);
    const checked = raw === true || raw === "true";
    return html`
      <div class="switch-field" data-field-key=${path.join(".")}>
        <div class="field-info">${this._renderLabel(entry)}</div>
        <wa-switch
          ?checked=${checked}
          ?disabled=${this.disabled}
          @change=${(e: Event) =>
            this._emitChange(
              path,
              (e.target as HTMLInputElement & { checked: boolean }).checked
            )}
        ></wa-switch>
      </div>
    `;
  }

  private _renderSelectField(entry: ConfigEntry, path: string[]) {
    const value = String(this._getAt(path) ?? "");
    const invalid = this._errorAt(path) !== null;
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
            ?disabled=${this.disabled}
            placeholder=${String(entry.default_value ?? "")}
            @input=${(e: Event) =>
              this._emitChange(path, (e.target as HTMLInputElement).value)}
          />
          <datalist id=${listId}>
            ${entry.options.map(
              (opt) => html`<option value=${opt.value}>${opt.label}</option>`
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
          ?disabled=${this.disabled}
          @change=${(e: Event) =>
            this._emitChange(path, (e.target as HTMLSelectElement).value)}
        >
          ${(entry.options ?? []).map(
            (opt) =>
              html`<wa-option value=${opt.value} ?selected=${opt.value === value}
                >${opt.label}</wa-option
              >`
          )}
        </wa-select>
        ${this._fieldErrorAt(path)}
      </div>
    `;
  }

  private _renderMultiValueField(entry: ConfigEntry, path: string[]) {
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
                ?disabled=${this.disabled}
                @input=${(e: Event) =>
                  this._updateMultiItem(path, i, (e.target as HTMLInputElement).value)}
              />
              <button
                type="button"
                class="multi-btn"
                ?disabled=${this.disabled}
                aria-label=${this._localize("device.multi_value_remove")}
                @click=${() => this._removeMultiItem(path, i)}
              >
                <wa-icon library="mdi" name="close"></wa-icon>
              </button>
            </div>
          `
        )}
        <button
          type="button"
          class="multi-btn multi-add"
          ?disabled=${this.disabled}
          @click=${() => this._addMultiItem(path)}
        >
          <wa-icon library="mdi" name="plus"></wa-icon>
          ${this._localize("device.multi_value_add")}
        </button>
        ${this._fieldErrorAt(path)}
      </div>
    `;
  }

  private _renderPinField(entry: ConfigEntry, path: string[]) {
    if (!this.board || this.board.pins.length === 0) {
      return this._renderStringField(entry, "text", path);
    }

    const value = String(this._getAt(path) ?? "");
    const invalid = this._errorAt(path) !== null;
    const required = entry.pin_features ?? [];
    const matchesFeatures = (pin: BoardPin) =>
      required.every((f) => pin.features.includes(f));
    const visible = this.board.pins.filter(matchesFeatures);

    const usedPins = this._findUsedPins(this.yaml, this.fromLine, this._sectionEndLine());

    return html`
      <div class="field" data-field-key=${path.join(".")}>
        ${this._renderLabel(entry)}
        <wa-select
          class=${invalid ? "invalid" : ""}
          ?disabled=${this.disabled}
          @change=${(e: Event) =>
            this._emitChange(path, (e.target as HTMLSelectElement).value)}
        >
          ${visible.map((pin) => {
            const optValue = `GPIO${pin.gpio}`;
            const primary = pin.label || optValue;
            const occupiedBy = pin.occupied_by || "";
            const usedBy = usedPins.get(pin.gpio) || "";
            const needsOutput =
              entry.pin_mode === PinMode.OUTPUT ||
              entry.pin_mode === PinMode.INPUT_OUTPUT;
            const isInputOnly = pin.features.includes(PinFeature.INPUT_ONLY);
            const inputOnlyConflict = needsOutput && isInputOnly;
            const disabled = pin.available === false || inputOnlyConflict;

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
   * Sentinel value for the "Add new <domain>" entry inside the
   * ID-reference dropdown. When the wa-select fires `change` with
   * this value we route to the add-component flow instead of writing
   * it as a config value.
   */
  private static readonly ADD_NEW_SENTINEL = "__esphome_add_new__";

  private _renderIdReferenceField(entry: ConfigEntry, path: string[]) {
    const domain = entry.references_component || "";
    const candidates = this._findReferencedComponents(this.yaml, domain);
    const value = String(this._getAt(path) ?? "");
    const invalid = this._errorAt(path) !== null;
    const empty = candidates.length === 0;

    const onChange = (e: Event) => {
      const select = e.target as HTMLSelectElement;
      const next = select.value;
      if (next === ESPHomeConfigEntryForm.ADD_NEW_SENTINEL) {
        // Revert the displayed value so the dropdown isn't stuck
        // showing "Add new …" while we navigate away. (For the
        // section-editor case the form stays mounted; for the dialog
        // case the form unmounts.)
        select.value = value;
        this._requestAddComponent(domain);
        return;
      }
      this._emitChange(path, next);
    };

    // The "Add new <domain>" option lives at the bottom of the
    // dropdown — same affordance as Home Assistant's entity pickers.
    // When it's the only option (empty state) the dropdown becomes
    // a single-call-to-action.
    const addOption = html`
      <wa-option
        class="id-option id-option-add ${empty ? "id-option-add--solo" : ""}"
        value=${ESPHomeConfigEntryForm.ADD_NEW_SENTINEL}
      >
        <span class="id-option-stack">
          <span class="id-option-primary id-option-primary-add">
            <wa-icon library="mdi" name="plus"></wa-icon>
            ${this._localize("device.id_reference_add", { domain })}
          </span>
        </span>
      </wa-option>
    `;

    if (empty) {
      return html`
        <div class="field" data-field-key=${path.join(".")}>
          ${this._renderLabel(entry)}
          <wa-select
            class=${invalid ? "invalid" : ""}
            ?disabled=${this.disabled}
            placeholder=${this._localize("device.id_reference_empty", {
              domain,
            })}
            @change=${onChange}
          >
            ${addOption}
          </wa-select>
          ${this._fieldErrorAt(path)}
        </div>
      `;
    }

    return html`
      <div class="field" data-field-key=${path.join(".")}>
        ${this._renderLabel(entry)}
        <wa-select
          class=${invalid ? "invalid" : ""}
          ?disabled=${this.disabled}
          @change=${onChange}
        >
          ${candidates.map(
            (c) =>
              html`<wa-option
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
              </wa-option>`
          )}
          ${addOption}
        </wa-select>
        ${this._fieldErrorAt(path)}
      </div>
    `;
  }

  /**
   * Ask the host to open the add-component flow filtered to a domain.
   * The `add-component-form` re-routes this within its own dialog
   * (catalog view, search filter); the section editor's host catches
   * it at a higher level and opens the dialog from scratch.
   */
  private _requestAddComponent(domain: string) {
    this.dispatchEvent(
      new CustomEvent("request-add-component", {
        detail: { domain },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _renderTextareaField(entry: ConfigEntry, path: string[]) {
    const value = String(this._getAt(path) ?? "");
    const invalid = this._errorAt(path) !== null;
    return html`
      <div class="field" data-field-key=${path.join(".")}>
        ${this._renderLabel(entry)}
        <textarea
          class="textarea-field ${invalid ? "invalid" : ""}"
          rows="4"
          ?disabled=${this.disabled}
          .value=${value}
          placeholder=${String(entry.default_value ?? "")}
          @input=${(e: Event) =>
            this._emitChange(path, (e.target as HTMLTextAreaElement).value)}
        ></textarea>
        ${this._fieldErrorAt(path)}
      </div>
    `;
  }

  private _renderIconField(entry: ConfigEntry, path: string[]) {
    const value = String(this._getAt(path) ?? "");
    const invalid = this._errorAt(path) !== null;
    return html`
      <div class="field" data-field-key=${path.join(".")}>
        ${this._renderLabel(entry)}
        <esphome-mdi-icon-picker
          .value=${value}
          .invalid=${invalid}
          .disabled=${this.disabled}
          .placeholder=${String(entry.default_value ?? "Choose an icon…")}
          @change=${(e: CustomEvent<{ value: string }>) =>
            this._emitChange(path, e.detail.value)}
        ></esphome-mdi-icon-picker>
        ${this._fieldErrorAt(path)}
      </div>
    `;
  }

  // ─── Label / help ──────────────────────────────────────────────

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

  // ─── Path-based value access ────────────────────────────────────

  private _getAt(path: string[]): unknown {
    return getIn(this.values, path);
  }

  private _scopeValues(path: string[]): Record<string, unknown> {
    const v = this._getAt(path);
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  }

  private _emitChange(path: string[], value: unknown) {
    this.dispatchEvent(
      new CustomEvent<ConfigEntryValueChange>("value-change", {
        detail: { path, value },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _errorAt(path: string[]): ValidationError | null {
    return this.errors.get(path.join(".")) ?? null;
  }

  private _fieldErrorAt(path: string[]) {
    const err = this._errorAt(path);
    if (!err) return nothing;
    return html`<span class="field-error">${this._localize(err.code, err.params)}</span>`;
  }

  // ─── Multi-value helpers ────────────────────────────────────────

  private _addMultiItem(path: string[]) {
    const cur = this._getAt(path);
    const current = Array.isArray(cur) ? cur : [];
    this._emitChange(path, [...current, ""]);
  }

  private _removeMultiItem(path: string[], idx: number) {
    const cur = this._getAt(path);
    const current = Array.isArray(cur) ? cur : [];
    this._emitChange(
      path,
      current.filter((_, i) => i !== idx)
    );
  }

  private _updateMultiItem(path: string[], idx: number, value: string) {
    const cur = this._getAt(path);
    const current = Array.isArray(cur) ? [...cur] : [];
    current[idx] = value;
    this._emitChange(path, current);
  }

  // ─── Nested expand/collapse ─────────────────────────────────────

  private _toggleNested(key: string) {
    // The set's semantics depend on `requiredOnly` — see
    // `_renderNestedField` — but the toggle is the same either way:
    // membership flips between "tracked" and "untracked".
    const next = new Set(this._nestedOpenSections);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this._nestedOpenSections = next;
  }

  /**
   * Force a nested group open. Used by parent forms (e.g. section
   * editor scrolling to a validation error) to make sure a deep field
   * is rendered before searching the DOM. Idempotent.
   *
   * Only meaningful in normal (non-requiredOnly) mode where the set
   * tracks "open" entries; in `requiredOnly` mode groups default open
   * already so this is a no-op.
   */
  public openNested(key: string) {
    if (this.requiredOnly) return;
    if (this._nestedOpenSections.has(key)) return;
    const next = new Set(this._nestedOpenSections);
    next.add(key);
    this._nestedOpenSections = next;
  }

  // ─── YAML scanning helpers ──────────────────────────────────────

  private _findUsedPins(
    yaml: string,
    excludeFromLine?: number,
    excludeToLine?: number
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
      const lineNo = i + 1;
      if (
        excludeFromLine !== undefined &&
        excludeToLine !== undefined &&
        lineNo >= excludeFromLine &&
        lineNo <= excludeToLine
      ) {
        continue;
      }
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

  private _sectionEndLine(): number | undefined {
    if (this.fromLine === undefined) return undefined;
    const lines = this.yaml.split("\n");
    for (let i = this.fromLine; i < lines.length; i++) {
      const line = lines[i];
      if (line === "") continue;
      if (/^[a-zA-Z]/.test(line)) return i;
    }
    return lines.length;
  }

  private _findReferencedComponents(
    yaml: string,
    domain: string
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
      const topMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):/);
      if (topMatch) {
        flush();
        inSection = topMatch[1] === domain;
        continue;
      }
      if (!inSection) continue;
      if (/^\s*-\s/.test(line)) flush();
      const idMatch = line.match(/^\s+(?:-\s+)?id:\s*["']?(\S+?)["']?\s*$/);
      if (idMatch) {
        currentId = idMatch[1];
        continue;
      }
      const nameMatch = line.match(/^\s+(?:-\s+)?name:\s*["']?(.+?)["']?\s*$/);
      if (nameMatch) {
        currentName = nameMatch[1];
        continue;
      }
    }
    flush();
    return result;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-config-entry-form": ESPHomeConfigEntryForm;
  }
}
