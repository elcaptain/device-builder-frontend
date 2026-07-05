import toast from "sonner-js";
import type { ConfigEntry } from "../../../api/types/config-entries.js";
import { entryAtPath, isDeclaringIdEntry } from "../../../util/config-entry-tree.js";
import { validateEntries } from "../../../util/config-validation.js";
import { isValidEspHomeId } from "../../../util/esphome-id.js";
import { getIn, setIn } from "../../../util/nested-values.js";
import {
  KEEP_EMPTY_STRING_SECTIONS,
  resolveSectionEntries,
} from "../../../util/section-entry-overrides.js";
import {
  idDeclaredElsewhere,
  renameIdInValues,
  renameIdReferences,
} from "../../../util/yaml-id-rename.js";
import {
  findSectionRange,
  removeSectionFromYaml,
  updateSectionInYaml,
} from "../../../util/yaml-section-values.js";
import { resolveCurrentFromLine } from "../../../util/yaml-sections.js";
import type { ConfigEntryValueChange } from "../config-entry-form.js";
import type { ESPHomeDeviceSectionConfig } from "../device-section-config.js";

// Validates against the *render* schema (resolveSectionEntries), not the raw
// catalog. MAP_SECTIONS (substitutions / packages) carry an irrelevant flat
// catalog schema that doesn't match what the user actually edits in the form —
// using it would surface phantom "missing required" errors per keystroke.
export function flushDraft(host: ESPHomeDeviceSectionConfig): void {
  host._draftTimer = null;
  if (!host._config) return;

  const fromLine = resolveCurrentFromLine(host.yaml, host.sectionKey, host.fromLine);
  if (fromLine === undefined) {
    // Section was removed from live YAML between keystroke and debounce
    // (paste / external edit). Drop the splice silently — next picker
    // click re-runs loadConfig against the current YAML.
    host._pendingIdRenames.clear();
    host._setDirty(false);
    return;
  }

  const renderEntries = resolveSectionEntries(host.sectionKey, host._config.entries);
  const renames = resolvePendingIdRenames(host, renderEntries, fromLine);
  host._fieldErrors = validateEntries(
    renderEntries,
    host._values,
    host._presentComponents,
    host.board?.esphome.platform ?? null,
    host.sectionKey
  );

  let newYaml = updateSectionInYaml(
    host.yaml,
    host.sectionKey,
    host._values,
    fromLine,
    // Substitutions: user-typed key + cleared value is intentional data
    // and must round-trip. Other MAP sections (packages) treat empty value
    // as an unfilled placeholder — packages schema validator rejects
    // empty-string definitions, so dropping placeholders keeps it loadable.
    { keepEmptyStrings: KEEP_EMPTY_STRING_SECTIONS.has(host.sectionKey) }
  );

  // Rewrite references to renamed ids across the rest of the buffer, in
  // the same draft so the declaration and its references move as one
  // buffer swap (one undo step in the YAML pane). The edited section's
  // new range is excluded — it was just spliced from the renamed values.
  // renameIdReferences never changes the line count, so the range is
  // computed once.
  if (renames.length) {
    const range = findSectionRange(newYaml.split("\n"), host.sectionKey, fromLine);
    const exclude = { excludeFromLine: range.start + 1, excludeToLine: range.end + 1 };
    for (const { from, to } of renames) {
      newYaml = renameIdReferences(newYaml, from, to, exclude);
    }
  }

  host._setDirty(false);

  if (newYaml === host.yaml) return;

  host._lastSelfWrittenYaml = newYaml;
  host.dispatchEvent(
    new CustomEvent("yaml-draft", {
      detail: { yaml: newYaml },
      bubbles: true,
      composed: true,
    })
  );
}

/**
 * Turn the pending id edits into actionable renames and rewrite the
 * section's own draft values for each. Skip-and-forget renames that
 * can't or shouldn't propagate; keep a pending entry whose new value is
 * mid-edit invalid so a later valid flush still renames from the id the
 * references actually hold.
 */
function resolvePendingIdRenames(
  host: ESPHomeDeviceSectionConfig,
  renderEntries: ConfigEntry[],
  fromLine: number
): { from: string; to: string }[] {
  if (!host._pendingIdRenames.size) return [];
  const range = findSectionRange(host.yaml.split("\n"), host.sectionKey, fromLine);
  const exclude = { excludeFromLine: range.start + 1, excludeToLine: range.end + 1 };
  const renames: { from: string; to: string }[] = [];
  for (const [key, pending] of host._pendingIdRenames) {
    const to = getIn(host._values, pending.path);
    if (typeof to !== "string" || !isValidEspHomeId(to)) continue; // keep pending
    host._pendingIdRenames.delete(key);
    if (to === pending.from || !isValidEspHomeId(pending.from)) continue;
    // A surviving declaration elsewhere still owns the old id — renaming
    // the references would break it.
    if (idDeclaredElsewhere(host.yaml, pending.from, exclude)) continue;
    host._values = renameIdInValues(host._values, renderEntries, pending.from, to);
    renames.push({ from: pending.from, to });
  }
  return renames;
}

export function onValueChange(
  host: ESPHomeDeviceSectionConfig,
  e: CustomEvent<ConfigEntryValueChange>
): void {
  const { path, value } = e.detail;
  recordPendingIdRename(host, path);
  host._values = setIn(host._values, path, value);
  host._setDirty(true);
  const errKey = path.join(".");
  if (host._fieldErrors.has(errKey)) {
    const next = new Map(host._fieldErrors);
    next.delete(errKey);
    host._fieldErrors = next;
  }
  // Same optimistic clear for the backend error on the edited path — it
  // reappears on the next lint pass if the value is still invalid.
  if (host.backendErrors.fields.has(errKey) && !host._clearedBackendPaths.has(errKey)) {
    host._clearedBackendPaths = new Set(host._clearedBackendPaths).add(errKey);
  }
  host._scheduleDraftFlush();
}

/**
 * Remember the id a declaring ID field held before this edit, so the
 * flush can rename references from it. First old value wins across the
 * debounce window; after a successful propagation the entry clears and
 * the next keystroke records the id the references now hold.
 */
function recordPendingIdRename(host: ESPHomeDeviceSectionConfig, path: string[]): void {
  const key = path.join(".");
  if (host._pendingIdRenames.has(key) || !host._config) return;
  const old = getIn(host._values, path);
  if (typeof old !== "string") return;
  const entry = entryAtPath(
    resolveSectionEntries(host.sectionKey, host._config.entries),
    path
  );
  if (!isDeclaringIdEntry(entry)) return;
  host._pendingIdRenames.set(key, { path, from: old });
}

/** Point the section's field(s) at generated values (from the security notice)
 *  in the unsaved draft and flush the result into the YAML buffer. Each entry is
 *  a `setIn` path and the value to write there — a `!secret <key>` reference for
 *  secret fields, or the literal value for inline ones (e.g. the web username). */
export function applySecuritySecrets(
  host: ESPHomeDeviceSectionConfig,
  secrets: { path: string[]; value: string }[]
): void {
  for (const { path, value } of secrets) {
    host._values = setIn(host._values, path, value);
  }
  host._setDirty(true);
  if (host._draftTimer) {
    clearTimeout(host._draftTimer);
    host._draftTimer = null;
  }
  flushDraft(host);
}

export async function onDeleteConfirmed(host: ESPHomeDeviceSectionConfig): Promise<void> {
  if (!host._config) return;
  const fromLine = resolveCurrentFromLine(host.yaml, host.sectionKey, host.fromLine);
  if (fromLine === undefined) {
    host._error = host._localize("device.section_delete_error");
    return;
  }
  host._deleting = true;
  host._error = "";
  const title = host._config.title;
  try {
    const newYaml = removeSectionFromYaml(host.yaml, host.sectionKey, fromLine);
    if (newYaml === host.yaml) {
      host._error = host._localize("device.section_delete_error");
      return;
    }
    await host._api.updateConfig(host.configuration, newYaml);
    host._setDirty(false);
    host.dispatchEvent(
      new CustomEvent("yaml-updated", {
        detail: { yaml: newYaml },
        bubbles: true,
        composed: true,
      })
    );
    host.dispatchEvent(
      new CustomEvent("section-select", {
        detail: { sectionKey: null },
        bubbles: true,
        composed: true,
      })
    );
    toast.success(host._localize("device.section_deleted", { name: title }), {
      richColors: true,
    });
  } catch (e) {
    host._error =
      e instanceof Error ? e.message : host._localize("device.section_delete_error");
  } finally {
    host._deleting = false;
  }
}
