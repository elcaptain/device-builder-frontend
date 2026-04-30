/**
 * Shared types + helpers used by every ConfigEntry renderer. Kept in
 * its own module so the simple-field, pin, and id-reference renderers
 * can import from one place without circular dependencies through the
 * barrel.
 */

import { mdiKeyVariant } from "@mdi/js";
import { html, nothing } from "lit";
import type { BoardCatalogEntry, ConfigEntry } from "../../api/types.js";
import type { LocalizeFunc } from "../../common/localize.js";
import type { ValidationError } from "../../util/config-validation.js";
import { renderMarkdown } from "../../util/markdown.js";
import { registerMdiIcons } from "../../util/register-icons.js";

registerMdiIcons({
  "key-variant": mdiKeyVariant,
});

/** ESPHome stores secret references as `!secret <key>` literal strings
 *  in the YAML — match that shape so any string-shaped field can flag
 *  values that point at the secrets store. */
const SECRET_REF_RE = /^!secret\s+(\S+)\s*$/;

/** Render a small "Using stored secret: <name>" hint when the value
 *  is a `!secret <key>` reference. Returns `nothing` otherwise so
 *  callers can drop it inline without conditional wrapping. */
export function renderSecretHint(value: string, ctx: RenderCtx) {
  const match = value.match(SECRET_REF_RE);
  if (!match) return nothing;
  return html`<span class="secret-note">
    <wa-icon library="mdi" name="key-variant"></wa-icon>
    <span>${ctx.localize("device.value_from_secret")}</span>
    <code>${match[1]}</code>
  </span>`;
}

export interface RenderCtx {
  localize: LocalizeFunc;
  disabled: boolean;
  yaml: string;
  fromLine?: number;
  board: BoardCatalogEntry | null;
  requiredOnly: boolean;
  nestedOpenSections: Set<string>;
  getAt: (path: string[]) => unknown;
  errorAt: (path: string[]) => ValidationError | null;
  emitChange: (path: string[], value: unknown) => void;
  toggleNested: (key: string) => void;
  requestAddComponent: (domain: string) => void;
  scopeValues: (path: string[]) => Record<string, unknown>;
  filterRenderable: (
    entries: ConfigEntry[],
    values: Record<string, unknown>
  ) => ConfigEntry[];
  renderEntry: (entry: ConfigEntry, path: string[]) => unknown;
}

export function labelFor(entry: ConfigEntry, ctx: RenderCtx): string {
  if (entry.translation_key) {
    const params = (entry.translation_params || undefined) as
      | Record<string, string | number>
      | undefined;
    const translated = ctx.localize(entry.translation_key, params);
    if (translated && translated !== entry.translation_key) return translated;
  }
  if (entry.label) return entry.label;
  return entry.key
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function renderHelpLink(entry: ConfigEntry, ctx: RenderCtx) {
  if (!entry.help_link) return nothing;
  return html`<a
    class="help-button"
    href=${entry.help_link}
    target="_blank"
    rel="noreferrer"
    title=${ctx.localize("device.docs")}
  >
    <wa-icon library="mdi" name="open-in-new"></wa-icon>
  </a>`;
}

export interface RenderLabelOptions {
  includeHelpLink?: boolean;
}

export function renderLabel(
  entry: ConfigEntry,
  ctx: RenderCtx,
  options: RenderLabelOptions = {}
) {
  const { includeHelpLink = true } = options;
  return html`
    <label class="field-label">
      ${labelFor(entry, ctx)}
      ${entry.required ? html`<span class="required">*</span>` : nothing}
      ${includeHelpLink && entry.help_link ? renderHelpLink(entry, ctx) : nothing}
    </label>
    ${entry.description
      ? html`<p class="field-description">
          ${renderMarkdown(entry.description)}
        </p>`
      : nothing}
  `;
}

export function renderFieldError(path: string[], ctx: RenderCtx) {
  const err = ctx.errorAt(path);
  if (!err) return nothing;
  return html`<span class="field-error">${ctx.localize(err.code, err.params)}</span>`;
}

// Re-exported by `config-entry-renderers.ts`; placed here so the pin
// renderer can fall back to a string field without importing the
// barrel and creating a cycle.
export function renderStringField(
  entry: ConfigEntry,
  inputType: string,
  path: string[],
  ctx: RenderCtx
) {
  const value = String(ctx.getAt(path) ?? "");
  const invalid = ctx.errorAt(path) !== null;
  const placeholder = String(entry.default_value ?? "");
  // Password inputs render the dedicated component so they get a
  // reveal/hide toggle. Keeping the show-state inside the component
  // means the form's re-renders don't blow it away.
  if (inputType === "password") {
    return html`
      <div class="field" data-field-key=${path.join(".")}>
        ${renderLabel(entry, ctx)}
        <esphome-password-input
          .value=${value}
          .invalid=${invalid}
          .disabled=${ctx.disabled}
          .placeholder=${placeholder}
          @input=${(e: CustomEvent<{ value: string }>) =>
            ctx.emitChange(path, e.detail.value)}
        ></esphome-password-input>
        ${renderSecretHint(value, ctx)} ${renderFieldError(path, ctx)}
      </div>
    `;
  }
  return html`
    <div class="field" data-field-key=${path.join(".")}>
      ${renderLabel(entry, ctx)}
      <input
        type=${inputType}
        class=${invalid ? "invalid" : ""}
        .value=${value}
        ?disabled=${ctx.disabled}
        placeholder=${placeholder}
        @input=${(e: Event) => ctx.emitChange(path, (e.target as HTMLInputElement).value)}
      />
      ${renderSecretHint(value, ctx)} ${renderFieldError(path, ctx)}
    </div>
  `;
}
