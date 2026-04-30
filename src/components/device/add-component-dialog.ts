import { consume } from "@lit/context";
import { mdiArrowLeft, mdiClose } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import type {
  BoardCatalogEntry,
  ComponentCatalogEntry,
} from "../../api/types.js";
import type { ESPHomeAPI } from "../../api/index.js";
import { findAddedSection } from "../../util/yaml-sections.js";
import type { LocalizeFunc } from "../../common/localize.js";
import { localizeContext, apiContext } from "../../context/index.js";
import { espHomeStyles } from "../../styles/shared.js";
import { registerMdiIcons } from "../../util/register-icons.js";

import "@home-assistant/webawesome/dist/components/dialog/dialog.js";
import "@home-assistant/webawesome/dist/components/icon/icon.js";
import "@home-assistant/webawesome/dist/components/spinner/spinner.js";
import "./component-catalog.js";
import "./add-component-form.js";
import type { ESPHomeComponentCatalog } from "./component-catalog.js";

registerMdiIcons({ close: mdiClose, "arrow-left": mdiArrowLeft });

@customElement("esphome-add-component-dialog")
export class ESPHomeAddComponentDialog extends LitElement {
  @consume({ context: localizeContext, subscribe: true })
  @state()
  private _localize: LocalizeFunc = (key) => key;

  @consume({ context: apiContext })
  private _api!: ESPHomeAPI;

  @property()
  boardName = "";

  @property()
  configuration = "";

  /** Device's target platform — forwarded to the catalog for default resolution. */
  @property()
  platform = "";

  /** Board metadata. Forwarded to the form so the embedded shared
   * config-entry-form can render the GPIO pin selector with proper
   * filtering and conflict detection. */
  @property({ attribute: false })
  board: BoardCatalogEntry | null = null;

  /** Current device YAML. Forwarded to the form so it can resolve
   * `depends_on_component` predicates, the component-level
   * `dependencies` list, and ID-reference dropdowns. */
  @property()
  yaml = "";

  @query("wa-dialog")
  private _dialog!: HTMLElement & { open: boolean };

  @query("esphome-component-catalog")
  private _catalog!: ESPHomeComponentCatalog;

  @state()
  private _selected: ComponentCatalogEntry | null = null;

  @state()
  private _submitting = false;

  @state()
  private _submitError = "";

  /**
   * Component the user was originally adding when they clicked
   * "+ Add <dep>" inside the form. After they finish adding the
   * dependency, we restore this component so they don't have to
   * re-navigate the catalog and re-fill what they had.
   */
  @state()
  private _returnTo: ComponentCatalogEntry | null = null;

  /** Domain the dep detour was started for (e.g. "output"). Used to
   * locate the matching `references_component` field on the original
   * form so we can pre-fill it with the just-created component's id. */
  @state()
  private _depDomain: string | null = null;

  /** Pre-fill payload handed to the restored form on its next mount.
   *  Cleared after the form mounts so it doesn't apply to subsequent
   *  selections. */
  @state()
  private _prefillReference: { domain: string; id: string } | null = null;

  static styles = [
    espHomeStyles,
    css`
      wa-dialog {
        --width: 900px;
      }

      wa-dialog.form-view {
        --width: 480px;
      }

      wa-dialog::part(header) {
        background: var(--esphome-primary);
        padding: 0 var(--wa-space-m);
        height: 40px;
        box-sizing: border-box;
      }

      wa-dialog::part(title) {
        color: var(--esphome-on-primary);
        font-size: var(--wa-font-size-s);
        font-weight: var(--wa-font-weight-bold);
      }

      wa-dialog::part(close-button__base) {
        background: transparent;
        border: none;
        box-shadow: none;
        padding: 0;
        min-width: unset;
        min-height: unset;
        color: var(--esphome-on-primary);
        cursor: pointer;
      }

      wa-dialog::part(body) {
        padding: var(--wa-space-l);
      }

      wa-dialog::part(footer) {
        display: none;
      }

      .dialog-label {
        display: flex;
        align-items: center;
        gap: var(--wa-space-xs);
        color: var(--esphome-on-primary);
        font-size: var(--wa-font-size-s);
        font-weight: var(--wa-font-weight-bold);
      }

      .back-button {
        display: inline-flex;
        align-items: center;
        border: none;
        background: none;
        padding: 2px;
        margin-right: var(--wa-space-2xs);
        color: var(--esphome-on-primary);
        cursor: pointer;
        border-radius: 4px;
        opacity: 0.85;
      }

      .back-button:hover {
        opacity: 1;
      }

      /* Breadcrumb that shows up while the user is detoured into
         "add a dependency" mid-way through adding another component.
         Tells them we'll bring them back to the original after. */
      .return-banner {
        display: flex;
        align-items: center;
        gap: var(--wa-space-2xs);
        margin-bottom: var(--wa-space-m);
        padding: var(--wa-space-2xs) var(--wa-space-s);
        background: color-mix(
          in srgb,
          var(--esphome-primary),
          transparent 92%
        );
        border-left: 3px solid var(--esphome-primary);
        border-radius: var(--wa-border-radius-s);
        font-size: var(--wa-font-size-xs);
        color: var(--wa-color-text-quiet);
      }

      .return-banner strong {
        color: var(--wa-color-text-normal);
        font-weight: var(--wa-font-weight-semibold);
      }
    `,
  ];

  public open() {
    this._resetDetourState();
    this._selected = null;
    this._submitError = "";
    this._submitting = false;
    this._dialog.open = true;
    this.updateComplete.then(() => this._catalog?.load());
  }

  /**
   * Open the dialog directly into the catalog filtered to a domain
   * (e.g. "output"). Used when the section editor's ID-reference
   * dropdown asks "+ Add new output" — we land the user one click
   * away from the right component instead of in the unfiltered
   * catalog.
   */
  public openWithSearch(domain: string) {
    this._resetDetourState();
    this._selected = null;
    this._submitError = "";
    this._submitting = false;
    this._dialog.open = true;
    this.updateComplete.then(() => this._catalog?.filterByDomain(domain));
  }

  private _resetDetourState() {
    this._returnTo = null;
    this._depDomain = null;
    this._prefillReference = null;
  }

  protected render() {
    const isForm = this._selected !== null;
    // TEMP debug — confirm dialog is receiving board/platform props.
    // eslint-disable-next-line no-console
    console.debug(
      "[add-component-dialog] render",
      { platform: this.platform, boardId: this.board?.id, hasBoard: !!this.board },
    );
    // Keep the catalog mounted permanently so its state (search query, scroll
    // position, expanded card) survives the round trip into the form view —
    // hide it with `hidden` rather than swapping it out of the DOM. The form
    // is fine to mount/unmount on demand since each selection starts fresh.
    return html`
      <wa-dialog
        class=${isForm ? "form-view" : ""}
        light-dismiss
        @add-component=${this._onComponentSelected}
        @form-cancel=${this._onBack}
        @form-submit=${this._onFormSubmit}
        @navigate-to-dep=${this._onNavigateToDep}
        @request-add-component=${this._onNavigateToDep}
      >
        <span slot="label" class="dialog-label">
          ${isForm
            ? html`<button class="back-button" @click=${this._onBack}>
                <wa-icon library="mdi" name="arrow-left"></wa-icon>
              </button>`
            : nothing}
          ${isForm
            ? this._selected!.name
            : this.boardName
              ? this._localize("device.add_component_dialog_title", { name: this.boardName })
              : this._localize("device.add_component")}
        </span>
        ${this._returnTo
          ? html`<div class="return-banner">
              ${this._localize("device.return_to_after_dep_prefix")}
              <strong>${this._returnTo.name}</strong>
              ${this._localize("device.return_to_after_dep_suffix")}
            </div>`
          : nothing}
        <esphome-component-catalog
          ?hidden=${isForm}
          .platform=${this.platform}
          .boardId=${this.board?.id ?? ""}
          .yaml=${this.yaml}
        ></esphome-component-catalog>
        ${isForm
          ? html`<esphome-add-component-form
              .component=${this._selected!}
              .board=${this.board}
              .yaml=${this.yaml}
              .prefillReference=${this._prefillReference}
              .submitting=${this._submitting}
              .submitError=${this._submitError}
            ></esphome-add-component-form>`
          : nothing}
      </wa-dialog>
    `;
  }

  private _onComponentSelected(e: CustomEvent<{ component: ComponentCatalogEntry }>) {
    e.stopPropagation();
    this._selected = e.detail.component;
    this._submitError = "";
  }

  private _onBack() {
    if (this._submitting) return;
    // If the user is in the middle of a "go add a dependency" detour
    // and they hit back, treat it as cancelling the detour: drop them
    // back at the original component they were filling in, instead of
    // sending them to the catalog and losing context.
    if (this._returnTo) {
      const restore = this._returnTo;
      this._resetDetourState();
      this._selected = restore;
      this._submitError = "";
      return;
    }
    this._selected = null;
    this._submitError = "";
  }

  /**
   * Switch to the catalog view filtered to a missing dependency's
   * domain. Remember the component the user was in the middle of
   * adding (and the domain) so we can restore + prefill after they
   * finish adding the dependency.
   */
  private async _onNavigateToDep(e: CustomEvent<{ domain: string }>) {
    e.stopPropagation();
    if (this._submitting) return;
    const { domain } = e.detail;
    if (this._selected) {
      this._returnTo = this._selected;
      this._depDomain = domain;
    }
    this._selected = null;
    this._submitError = "";
    await this.updateComplete;
    this._catalog?.filterByDomain(domain);
  }

  private async _onFormSubmit(e: CustomEvent<{ fields: Record<string, unknown> }>) {
    e.stopPropagation();
    if (!this._selected || !this.configuration || this._submitting) return;
    this._submitting = true;
    this._submitError = "";
    try {
      const { yaml } = await this._api.addComponent(this.configuration, {
        component_id: this._selected.id,
        fields: e.detail.fields,
      });

      // Notify the host so the page re-fetches / re-renders with the
      // new YAML. We dispatch this BEFORE deciding whether to close —
      // when restoring `_returnTo` the dialog stays open, but we still
      // need the device to know the YAML changed (so the dependency
      // we just added shows up in the original component's dropdown).
      this.dispatchEvent(
        new CustomEvent("yaml-updated", {
          detail: { yaml },
          bubbles: true,
          composed: true,
        }),
      );

      if (this._returnTo) {
        // Just finished adding a dependency — restore the original
        // component's form so the user can continue where they left
        // off. The form re-mounts fresh and re-reads `this.yaml`,
        // which now contains the dep, so the ID-reference dropdown
        // will be populated.
        const restore = this._returnTo;
        const depDomain = this._depDomain;
        // If the component the user just added matches the dep domain
        // we navigated for, hand the new id to the restored form so
        // it pre-selects it in the matching reference field. Match by
        // category to defend against the user picking something else
        // from the filtered catalog.
        const newId = e.detail.fields["id"];
        if (
          depDomain &&
          typeof newId === "string" &&
          this._selected.category === depDomain
        ) {
          this._prefillReference = { domain: depDomain, id: newId };
        } else {
          this._prefillReference = null;
        }
        this._returnTo = null;
        this._depDomain = null;
        this._selected = restore;
      } else {
        // Auto-select the just-added component so the navigator
        // highlights it and the section editor jumps to its block.
        // Falls through silently if we can't find it — better to
        // leave the previous selection alone than navigate somewhere
        // wrong.
        const componentId = this._selected.id;
        const newId = e.detail.fields["id"];
        const target = findAddedSection(
          yaml,
          componentId,
          typeof newId === "string" ? newId : undefined,
        );
        if (target) {
          this.dispatchEvent(
            new CustomEvent("section-select", {
              detail: target,
              bubbles: true,
              composed: true,
            }),
          );
        }
        this._dialog.open = false;
        this._selected = null;
        this._resetDetourState();
      }
    } catch (err) {
      this._submitError = err instanceof Error
        ? err.message
        : this._localize("device.add_component_error");
    } finally {
      this._submitting = false;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-add-component-dialog": ESPHomeAddComponentDialog;
  }
}
