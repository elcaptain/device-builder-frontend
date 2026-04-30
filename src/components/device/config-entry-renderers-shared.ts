/**
 * Shared types + helpers used by every ConfigEntry renderer. Kept in
 * its own module so the simple-field, pin, and id-reference renderers
 * can import from one place without circular dependencies through the
 * barrel.
 */

import { html, nothing } from "lit";
import type {
  BoardCatalogEntry,
  ConfigEntry,
} from "../../api/types.js";
import type { LocalizeFunc } from "../../common/localize.js";
import type { ValidationError } from "../../util/config-validation.js";

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
    values: Record<string, unknown>,
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

function renderHelpLink(entry: ConfigEntry, ctx: RenderCtx) {
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

export function renderLabel(entry: ConfigEntry, ctx: RenderCtx) {
  return html`
    <label class="field-label">
      ${labelFor(entry, ctx)}
      ${entry.required ? html`<span class="required">*</span>` : nothing}
      ${entry.help_link ? renderHelpLink(entry, ctx) : nothing}
    </label>
    ${entry.description
      ? html`<p class="field-description">${entry.description}</p>`
      : nothing}
  `;
}

export function renderFieldError(path: string[], ctx: RenderCtx) {
  const err = ctx.errorAt(path);
  if (!err) return nothing;
  return html`<span class="field-error"
    >${ctx.localize(err.code, err.params)}</span
  >`;
}

// Re-exported by `config-entry-renderers.ts`; placed here so the pin
// renderer can fall back to a string field without importing the
// barrel and creating a cycle.
export function renderStringField(
  entry: ConfigEntry,
  inputType: string,
  path: string[],
  ctx: RenderCtx,
) {
  const value = String(ctx.getAt(path) ?? "");
  const invalid = ctx.errorAt(path) !== null;
  return html`
    <div class="field" data-field-key=${path.join(".")}>
      ${renderLabel(entry, ctx)}
      <input
        type=${inputType}
        class=${invalid ? "invalid" : ""}
        .value=${value}
        ?disabled=${ctx.disabled}
        placeholder=${String(entry.default_value ?? "")}
        @input=${(e: Event) =>
          ctx.emitChange(path, (e.target as HTMLInputElement).value)}
      />
      ${renderFieldError(path, ctx)}
    </div>
  `;
}
