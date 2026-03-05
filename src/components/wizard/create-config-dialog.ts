import { consume } from "@lit/context";
import { mdiArrowLeft, mdiClose } from "@mdi/js";
import { LitElement, css, html, nothing } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import type { LocalizeFunc } from "../../common/localize.js";
import { localizeContext } from "../../context/index.js";
import { espHomeStyles } from "../../styles/shared.js";
import type { MockBoard } from "../../api/mock.js";
import { registerMdiIcons } from "../../util/register-icons.js";

import "@home-assistant/webawesome/dist/components/dialog/dialog.js";
import "@home-assistant/webawesome/dist/components/icon/icon.js";
import "./wizard-step-board.js";
import "./wizard-step-empty-config.js";
import "./wizard-step-method.js";
import "./wizard-step-setup.js";

registerMdiIcons({ close: mdiClose, "arrow-left": mdiArrowLeft });

type WizardStep = "method" | "board" | "setup" | "empty-config";
type WizardStepDetail = WizardStep | { step: WizardStep; board?: MockBoard | null };

@customElement("esphome-create-config-dialog")
export class ESPHomeCreateConfigDialog extends LitElement {
  @consume({ context: localizeContext, subscribe: true })
  @state()
  private _localize: LocalizeFunc = (key) => key;

  @state()
  private _step: WizardStep = "method";

  @state()
  private _selectedBoard: MockBoard | null = null;

  @query("wa-dialog")
  private _dialog!: HTMLElement & { open: boolean };

  static styles = [
    espHomeStyles,
    css`
      wa-dialog {
        --width: 520px;
      }

      wa-dialog.wide {
        --width: 680px;
      }

      /* ─── Header ─── */

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

      /* Strip button chrome — render as plain icon */
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
        padding: var(--wa-space-l) var(--wa-space-xl);
      }

      wa-dialog::part(footer) {
        display: none;
      }
    `,
  ];

  public open() {
    this._step = "method";
    this._dialog.open = true;
  }

  public close() {
    this._dialog.open = false;
  }

  private get _title(): string {
    switch (this._step) {
      case "method":
        return this._localize("wizard.title_create");
      case "board":
        return this._localize("wizard.title_board");
      case "setup":
        return this._localize("wizard.title_setup");
      case "empty-config":
        return this._localize("wizard.title_empty_config");
    }
  }

  protected render() {
    return html`
      <wa-dialog
        class=${this._step === "board" ? "wide" : ""}
        light-dismiss
        @next-step=${this._onNextStep}
        @finish-setup=${this._onFinishSetup}
        @create-empty-config=${this._onCreateEmptyConfig}
        @import-config=${this._onImportConfig}
      >
        <span slot="label" class="dialog-label">
          ${this._step !== "method"
            ? html`<button class="back-button" @click=${this._onBack}>
                <wa-icon library="mdi" name="arrow-left"></wa-icon>
              </button>`
            : nothing}
          ${this._title}
        </span>
        ${this._renderStep()}
      </wa-dialog>
    `;
  }

  private _renderStep() {
    switch (this._step) {
      case "method":
        return html`<esphome-wizard-step-method></esphome-wizard-step-method>`;
      case "board":
        return html`<esphome-wizard-step-board></esphome-wizard-step-board>`;
      case "setup":
        return html`<esphome-wizard-step-setup .board=${this._selectedBoard}></esphome-wizard-step-setup>`;
      case "empty-config":
        return html`<esphome-wizard-step-empty-config></esphome-wizard-step-empty-config>`;
    }
  }

  private _onNextStep(e: CustomEvent<WizardStepDetail>) {
    const detail = e.detail;
    if (typeof detail === "string") {
      this._step = detail;
      return;
    }

    this._step = detail.step;
    if (detail.board !== undefined) {
      this._selectedBoard = detail.board;
    }
  }

  private _onBack() {
    switch (this._step) {
      case "board":
        this._step = "method";
        break;
      case "setup":
        this._step = "board";
        break;
      case "empty-config":
        this._step = "method";
        break;
    }
  }

  private _onCreateEmptyConfig() {
    this.close();
  }

  private _onImportConfig() {
    this.close();
  }

  private _onFinishSetup() {
    this.close();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-create-config-dialog": ESPHomeCreateConfigDialog;
  }
}
