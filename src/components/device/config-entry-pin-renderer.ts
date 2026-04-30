/**
 * Pin selector renderer. Lifted out of `config-entry-renderers.ts`
 * because pin rendering carries its own per-option metadata
 * computation (in-use detection, input-only conflicts, supporting
 * text) that's heavier than every other field type.
 */

import { html, nothing, type TemplateResult } from "lit";
import type { BoardPin, ConfigEntry } from "../../api/types.js";
import { PinFeature, PinMode } from "../../api/types.js";
import {
  findUsedPins,
  sectionEndLine,
} from "../../util/config-entry-yaml-scan.js";
import {
  renderFieldError,
  renderLabel,
  renderStringField,
  type RenderCtx,
} from "./config-entry-renderers-shared.js";

interface PinOptionView {
  optValue: string;
  primary: string;
  secondary: string;
  titleText: string;
  inUse: boolean;
  disabled: boolean;
}

function buildPinOption(
  pin: BoardPin,
  entry: ConfigEntry,
  usedPins: Map<number, string>,
  ctx: RenderCtx,
): PinOptionView {
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
    ? ctx.localize("device.pin_occupied_by", { name: occupiedBy })
    : usedBy
      ? ctx.localize("device.pin_used_by", { name: usedBy })
      : "";
  const baseSupporting = inputOnlyConflict
    ? ctx.localize("device.pin_input_only")
    : pin.notes ||
      (pin.available === false ? ctx.localize("device.pin_unavailable") : "");

  const secondaryParts: string[] = [];
  if (pin.label && pin.label !== optValue) secondaryParts.push(optValue);
  if (inUseText) secondaryParts.push(inUseText);
  if (baseSupporting) secondaryParts.push(baseSupporting);

  return {
    optValue,
    primary,
    secondary: secondaryParts.join(" • "),
    titleText: [inUseText, baseSupporting].filter(Boolean).join(" — "),
    inUse,
    disabled,
  };
}

export function renderPinField(
  entry: ConfigEntry,
  path: string[],
  ctx: RenderCtx,
): TemplateResult {
  if (!ctx.board || ctx.board.pins.length === 0) {
    return renderStringField(entry, "text", path, ctx);
  }

  const value = String(ctx.getAt(path) ?? "");
  const invalid = ctx.errorAt(path) !== null;
  const required = entry.pin_features ?? [];
  const matchesFeatures = (pin: BoardPin) =>
    required.every((f) => pin.features.includes(f));
  const visible = ctx.board.pins.filter(matchesFeatures);
  const usedPins = findUsedPins(
    ctx.yaml,
    ctx.fromLine,
    sectionEndLine(ctx.yaml, ctx.fromLine),
  );

  return html`
    <div class="field" data-field-key=${path.join(".")}>
      ${renderLabel(entry, ctx)}
      <wa-select
        class=${invalid ? "invalid" : ""}
        ?disabled=${ctx.disabled}
        @change=${(e: Event) =>
          ctx.emitChange(path, (e.target as HTMLSelectElement).value)}
      >
        ${visible.map((pin) => {
          const v = buildPinOption(pin, entry, usedPins, ctx);
          return html`<wa-option
            class="pin-option ${v.inUse ? "pin-option--warn" : ""}"
            value=${v.optValue}
            .label=${v.primary}
            ?selected=${v.optValue === value}
            ?disabled=${v.disabled}
            title=${v.titleText}
          >
            <span class="pin-option-stack">
              <span class="pin-option-primary">
                ${v.primary}
                ${v.inUse
                  ? html`<wa-icon
                      class="pin-warn-icon"
                      library="mdi"
                      name="alert-circle-outline"
                    ></wa-icon>`
                  : nothing}
              </span>
              ${v.secondary
                ? html`<span class="pin-option-secondary">${v.secondary}</span>`
                : nothing}
            </span>
          </wa-option>`;
        })}
      </wa-select>
      ${renderFieldError(path, ctx)}
    </div>
  `;
}
