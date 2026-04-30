import { consume } from "@lit/context";
import {
  mdiContentSave,
  mdiInformationOutline,
  mdiOpenInNew,
} from "@mdi/js";
import { html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import toast from "sonner-js";
import type { ESPHomeAPI } from "../../api/index.js";
import type { BoardCatalogEntry, ConfigEntry } from "../../api/types.js";
import type { LocalizeFunc } from "../../common/localize.js";
import { apiContext, localizeContext } from "../../context/index.js";
import { inputStyles } from "../../styles/inputs.js";
import { espHomeStyles } from "../../styles/shared.js";
import {
  anyAdvancedEntry,
  findFirstErrorTarget,
} from "../../util/config-entry-tree.js";
import {
  validateEntries,
  type ValidationError,
} from "../../util/config-validation.js";
import { renderMarkdown } from "../../util/markdown.js";
import { setIn } from "../../util/nested-values.js";
import { registerMdiIcons } from "../../util/register-icons.js";
import {
  parseYamlSectionValues,
  updateSectionInYaml,
} from "../../util/yaml-section-values.js";
import { parseTopLevelComponents } from "../../util/yaml-serialize.js";

import "@home-assistant/webawesome/dist/components/icon/icon.js";
import "@home-assistant/webawesome/dist/components/spinner/spinner.js";
import "@home-assistant/webawesome/dist/components/switch/switch.js";
import "./config-entry-form.js";
import type {
  ConfigEntryValueChange,
  ESPHomeConfigEntryForm,
} from "./config-entry-form.js";
import { deviceSectionConfigStyles } from "./device-section-config.styles.js";

registerMdiIcons({
  "content-save": mdiContentSave,
  "information-outline": mdiInformationOutline,
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

/**
 * Top-level keys we always treat as YAML-only regardless of what the
 * backend returns. `packages` is the remaining holdout — its YAML
 * shape (dict-of-dicts referencing remote files) doesn't fit the
 * MAP-of-typed-values pattern. Everything else (substitutions,
 * globals, ...) now relies on the backend describing it as a MAP
 * entry, and falls back to the YAML notice automatically when the
 * schema returns no entries.
 */
const YAML_ONLY_SECTIONS = new Set(["packages"]);

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

  /** Whether the device editor's YAML pane is currently visible.
   *  When it isn't, the YAML-only notice grows a "Show YAML editor"
   *  button so the user can reach the editor in one click. */
  @property({ type: Boolean })
  yamlPaneVisible = true;

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

  static styles = [espHomeStyles, inputStyles, deviceSectionConfigStyles];

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
      this._values = parseYamlSectionValues(
        yaml,
        this.sectionKey,
        this.fromLine,
      );
      this._presentComponents = parseTopLevelComponents(yaml);
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
    const hasAdvanced = anyAdvancedEntry(this._config.entries);
    // Free-form / structural sections: show the description + a
    // "edit via YAML" notice instead of attempting to render the form.
    // We force this for `substitutions`, `globals`, `packages` (where
    // any schema the backend returns won't match the actual list /
    // dict shape) and also fall back to it for any section that
    // happens to come back with no entries at all.
    const yamlOnly =
      YAML_ONLY_SECTIONS.has(this.sectionKey) ||
      this._config.entries.length === 0;

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
          <p class="section-desc">
            ${renderMarkdown(this._config.description)}
          </p>
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
      ${yamlOnly
        ? html`<div class="yaml-only-notice" role="note">
            <wa-icon library="mdi" name="information-outline"></wa-icon>
            <div class="yaml-only-notice-body">
              <p>${this._localize("device.yaml_only_section")}</p>
              ${this.yamlPaneVisible
                ? nothing
                : html`<button
                    type="button"
                    class="yaml-only-notice-cta"
                    @click=${this._onShowYamlEditor}
                  >
                    ${this._localize("device.show_yaml_editor")}
                  </button>`}
            </div>
          </div>`
        : html`
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
                        (
                          e.target as HTMLInputElement & {
                            checked: boolean;
                          }
                        ).checked,
                      )}
                  >
                    ${this._localize("device.show_advanced")}
                  </wa-switch>
                </div>`
              : nothing}
            ${this._error
              ? html`<p class="error">${this._error}</p>`
              : nothing}
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
          `}
    `;
  }

  private _onShowYamlEditor() {
    this.dispatchEvent(
      new CustomEvent("show-yaml-editor", {
        bubbles: true,
        composed: true,
      }),
    );
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

    const firstHit = findFirstErrorTarget(this._config.entries, errors);
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
      const newYaml = updateSectionInYaml(
        yaml,
        this.sectionKey,
        this._values,
        this.fromLine,
      );
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
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-device-section-config": ESPHomeDeviceSectionConfig;
  }
}
