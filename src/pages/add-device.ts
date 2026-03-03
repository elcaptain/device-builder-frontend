/**
 * Wizard page - create a new ESPHome device configuration.
 *
 * Features:
 * - Step-based progress indicator
 * - Form validation with inline feedback
 * - Platform and board selection with search
 * - WiFi and security configuration
 */
import { LitElement, html, css, nothing, PropertyValues } from "lit";
import { customElement, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { consume } from "@lit/context";
import { apiContext } from "../context/index.js";
import type { ESPHomeAPI } from "../api/index.js";
import type { Board, WizardRequest } from "../api/types.js";
import { espHomeStyles, layoutStyles } from "../styles/shared.js";
import { registerMdiIcons } from "../util/register-icons.js";
import {
  mdiArrowLeft,
  mdiArrowRight,
  mdiCheck,
  mdiChip,
  mdiWifi,
  mdiLock,
  mdiChevronRight,
} from "@mdi/js";

import "@home-assistant/webawesome/dist/components/button/button.js";
import "@home-assistant/webawesome/dist/components/card/card.js";
import "@home-assistant/webawesome/dist/components/input/input.js";
import "@home-assistant/webawesome/dist/components/select/select.js";
import "@home-assistant/webawesome/dist/components/option/option.js";
import "@home-assistant/webawesome/dist/components/spinner/spinner.js";
import "@home-assistant/webawesome/dist/components/icon/icon.js";
import "@home-assistant/webawesome/dist/components/divider/divider.js";

registerMdiIcons({
  "arrow-left": mdiArrowLeft,
  "arrow-right": mdiArrowRight,
  check: mdiCheck,
  chip: mdiChip,
  wifi: mdiWifi,
  lock: mdiLock,
  "chevron-right": mdiChevronRight,
});

const PLATFORMS = [
  { value: "esp32", label: "ESP32" },
  { value: "esp8266", label: "ESP8266" },
  { value: "rp2040", label: "RP2040" },
  { value: "bk72xx", label: "BK72xx" },
  { value: "ln882x", label: "LN882x" },
  { value: "rtl87xx", label: "RTL87xx" },
];

interface WizardStep {
  id: string;
  label: string;
  icon: string;
}

const STEPS: WizardStep[] = [
  { id: "device", label: "Device", icon: "chip" },
  { id: "wifi", label: "WiFi", icon: "wifi" },
  { id: "security", label: "Security", icon: "lock" },
];

@customElement("esphome-page-add-device")
export class ESPHomePageAddDevice extends LitElement {
  @consume({ context: apiContext })
  @state()
  private _api!: ESPHomeAPI;

  @state() private _currentStep = 0;
  @state() private _name = "";
  @state() private _platform = "esp32";
  @state() private _board = "";
  @state() private _ssid = "";
  @state() private _psk = "";
  @state() private _password = "";
  @state() private _boards: Board[] = [];
  @state() private _isLoading = false;
  @state() private _isSubmitting = false;
  @state() private _errors: Record<string, string> = {};

  static styles = [
    espHomeStyles,
    layoutStyles,
    css`
      :host {
        display: block;
      }

      /* ─── Breadcrumb ─── */

      .breadcrumb {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-bottom: 20px;
        font-size: 0.85rem;
        color: var(--wa-color-text-quiet, #6c757d);
      }

      .breadcrumb a {
        color: var(--wa-color-text-quiet, #6c757d);
        text-decoration: none;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .breadcrumb a:hover {
        color: var(--esphome-primary);
      }

      .breadcrumb .current {
        color: var(--wa-color-text-normal, #212529);
        font-weight: 500;
      }

      .breadcrumb wa-icon {
        font-size: 1rem;
      }

      .page-header {
        margin-bottom: 32px;
      }

      .page-header h1 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--wa-color-text-normal, #212529);
      }

      .page-header p {
        margin: 8px 0 0;
        color: var(--wa-color-text-quiet, #6c757d);
        font-size: 0.9rem;
      }

      /* ─── Stepper ─── */

      .stepper {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0;
        margin-bottom: 32px;
      }

      .step {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        border-radius: 8px;
        font-size: 0.85rem;
        color: var(--wa-color-text-quiet, #adb5bd);
        transition: all 0.2s;
      }

      .step.active {
        color: var(--esphome-primary);
        font-weight: 600;
        background: color-mix(in srgb, var(--esphome-primary), transparent 92%);
      }

      .step.completed {
        color: var(--wa-color-success-60, #2ecc71);
      }

      .step-number {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 2px solid currentColor;
        font-size: 0.75rem;
        font-weight: 700;
        flex-shrink: 0;
      }

      .step.active .step-number {
        background: var(--esphome-primary);
        color: white;
        border-color: var(--esphome-primary);
      }

      .step.completed .step-number {
        background: var(--wa-color-success-60, #2ecc71);
        color: white;
        border-color: var(--wa-color-success-60, #2ecc71);
      }

      .step-connector {
        width: 40px;
        height: 2px;
        background: var(--wa-color-surface-border, #dee2e6);
        flex-shrink: 0;
      }

      .step-connector.completed {
        background: var(--wa-color-success-60, #2ecc71);
      }

      /* ─── Form ─── */

      .wizard-card {
        max-width: 600px;
        margin: 0 auto;
      }

      .wizard-form {
        padding: 28px;
      }

      .form-field {
        margin-bottom: 24px;
      }

      .form-field:last-child {
        margin-bottom: 0;
      }

      .field-error {
        font-size: 0.78rem;
        color: var(--wa-color-danger-60, #e74c3c);
        margin-top: 4px;
      }

      .form-actions {
        display: flex;
        gap: 12px;
        margin-top: 32px;
        justify-content: space-between;
      }

      .form-actions .left {
        display: flex;
        gap: 12px;
      }

      .form-actions .right {
        display: flex;
        gap: 12px;
      }

      .step-description {
        font-size: 0.85rem;
        color: var(--wa-color-text-quiet, #6c757d);
        margin-bottom: 24px;
      }
    `,
  ];

  firstUpdated(changedProperties: PropertyValues) {
    super.firstUpdated(changedProperties);
    this._loadBoards();
  }

  protected render() {
    return html`
      <div class="page-content">
        <div class="breadcrumb">
          <a href="/">
            <wa-icon library="mdi" name="chip"></wa-icon>
            Devices
          </a>
          <wa-icon library="mdi" name="chevron-right"></wa-icon>
          <span class="current">New Device</span>
        </div>

        <div class="page-header">
          <h1>New Device</h1>
          <p>Configure your new ESPHome device step by step.</p>
        </div>

        ${this._renderStepper()}

        <wa-card class="wizard-card">
          <div class="wizard-form">
            ${this._currentStep === 0 ? this._renderDeviceStep() : nothing}
            ${this._currentStep === 1 ? this._renderWifiStep() : nothing}
            ${this._currentStep === 2 ? this._renderSecurityStep() : nothing}
          </div>
        </wa-card>
      </div>
    `;
  }

  private _renderStepper() {
    return html`
      <div class="stepper">
        ${STEPS.map((step, index) => {
          const isActive = index === this._currentStep;
          const isCompleted = index < this._currentStep;
          return html`
            ${index > 0
              ? html`<div class="step-connector ${isCompleted ? "completed" : ""}"></div>`
              : nothing}
            <div
              class=${classMap({
                step: true,
                active: isActive,
                completed: isCompleted,
              })}
            >
              <span class="step-number">
                ${isCompleted
                  ? html`<wa-icon library="mdi" name="check"></wa-icon>`
                  : index + 1}
              </span>
              ${step.label}
            </div>
          `;
        })}
      </div>
    `;
  }

  private _renderDeviceStep() {
    return html`
      <p class="step-description">Choose a name and hardware platform for your device.</p>

      <div class="form-field">
        <wa-input
          label="Device Name"
          placeholder="my-device"
          help-text="Use lowercase letters, numbers, and hyphens only"
          .value=${this._name}
          @wa-input=${this._handleNameInput}
          required
        ></wa-input>
        ${this._errors.name
          ? html`<div class="field-error">${this._errors.name}</div>`
          : nothing}
      </div>

      <div class="form-field">
        <wa-select
          label="Platform"
          .value=${this._platform}
          @wa-change=${this._handlePlatformChange}
        >
          ${PLATFORMS.map(
            (p) => html`<wa-option value=${p.value}>${p.label}</wa-option>`
          )}
        </wa-select>
      </div>

      <div class="form-field">
        ${this._isLoading
          ? html`<wa-spinner></wa-spinner>`
          : html`
              <wa-select
                label="Board"
                .value=${this._board}
                @wa-change=${this._handleBoardChange}
                help-text="Select the specific board you are using"
              >
                ${this._boards.map(
                  (b) => html`<wa-option value=${b.board}>${b.name}</wa-option>`
                )}
              </wa-select>
            `}
      </div>

      <div class="form-actions">
        <div class="left">
          <wa-button href="/" variant="neutral">Cancel</wa-button>
        </div>
        <div class="right">
          <wa-button
            variant="brand"
            @click=${this._nextStep}
            ?disabled=${!this._name || !this._board}
          >
            Next
            <wa-icon slot="end" library="mdi" name="arrow-right"></wa-icon>
          </wa-button>
        </div>
      </div>
    `;
  }

  private _renderWifiStep() {
    return html`
      <p class="step-description">
        Configure WiFi credentials so your device can connect to your network.
      </p>

      <div class="form-field">
        <wa-input
          label="WiFi SSID"
          placeholder="Your WiFi network name"
          .value=${this._ssid}
          @wa-input=${this._handleSsidInput}
        ></wa-input>
      </div>

      <div class="form-field">
        <wa-input
          label="WiFi Password"
          type="password"
          placeholder="Your WiFi password"
          .value=${this._psk}
          @wa-input=${this._handlePskInput}
        ></wa-input>
      </div>

      <div class="form-actions">
        <div class="left">
          <wa-button variant="neutral" @click=${this._prevStep}>
            <wa-icon slot="start" library="mdi" name="arrow-left"></wa-icon>
            Back
          </wa-button>
        </div>
        <div class="right">
          <wa-button variant="brand" @click=${this._nextStep}>
            Next
            <wa-icon slot="end" library="mdi" name="arrow-right"></wa-icon>
          </wa-button>
        </div>
      </div>
    `;
  }

  private _renderSecurityStep() {
    return html`
      <p class="step-description">
        Set an optional OTA password to secure over-the-air updates.
      </p>

      <div class="form-field">
        <wa-input
          label="OTA Password"
          type="password"
          placeholder="Leave blank for no password"
          help-text="Protects your device from unauthorized firmware updates"
          .value=${this._password}
          @wa-input=${this._handlePasswordInput}
        ></wa-input>
      </div>

      <div class="form-actions">
        <div class="left">
          <wa-button variant="neutral" @click=${this._prevStep}>
            <wa-icon slot="start" library="mdi" name="arrow-left"></wa-icon>
            Back
          </wa-button>
        </div>
        <div class="right">
          <wa-button
            variant="brand"
            @click=${this._handleSubmit}
            ?disabled=${this._isSubmitting}
          >
            <wa-icon slot="start" library="mdi" name="check"></wa-icon>
            ${this._isSubmitting ? "Creating..." : "Create Device"}
          </wa-button>
        </div>
      </div>
    `;
  }

  private _nextStep() {
    if (this._currentStep === 0) {
      // Validate device step
      const errors: Record<string, string> = {};
      if (!this._name) {
        errors.name = "Device name is required";
      } else if (
        !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(this._name) &&
        this._name.length > 1
      ) {
        errors.name = "Use only lowercase letters, numbers, and hyphens";
      }
      this._errors = errors;
      if (Object.keys(errors).length > 0) return;
    }
    if (this._currentStep < STEPS.length - 1) {
      this._currentStep++;
    }
  }

  private _prevStep() {
    if (this._currentStep > 0) {
      this._currentStep--;
    }
  }

  private _handleNameInput(e: CustomEvent) {
    this._name = (e.target as HTMLInputElement).value;
    if (this._errors.name) {
      this._errors = { ...this._errors, name: "" };
    }
  }

  private _handlePlatformChange(e: CustomEvent) {
    this._platform = (e.target as HTMLSelectElement).value;
    this._board = "";
    this._loadBoards();
  }

  private _handleBoardChange(e: CustomEvent) {
    this._board = (e.target as HTMLSelectElement).value;
  }

  private _handleSsidInput(e: CustomEvent) {
    this._ssid = (e.target as HTMLInputElement).value;
  }

  private _handlePskInput(e: CustomEvent) {
    this._psk = (e.target as HTMLInputElement).value;
  }

  private _handlePasswordInput(e: CustomEvent) {
    this._password = (e.target as HTMLInputElement).value;
  }

  private async _loadBoards() {
    if (!this._api) return;
    this._isLoading = true;
    try {
      this._boards = await this._api.getBoards(this._platform);
      if (this._boards.length > 0 && !this._board) {
        this._board = this._boards[0].board;
      }
    } catch (err) {
      console.error("Failed to load boards:", err);
      this._boards = [];
    } finally {
      this._isLoading = false;
    }
  }

  private async _handleSubmit() {
    if (!this._name || !this._board) return;

    this._isSubmitting = true;
    try {
      const data: WizardRequest = {
        name: this._name,
        platform: this._platform,
        board: this._board,
        ssid: this._ssid,
        psk: this._psk,
        password: this._password,
        type: "basic",
      };

      await this._api.createWizard(data);

      // Navigate to the new device
      const path = `/device/${this._name}.yaml`;
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    } catch (err) {
      console.error("Failed to create device:", err);
    } finally {
      this._isSubmitting = false;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "esphome-page-add-device": ESPHomePageAddDevice;
  }
}
