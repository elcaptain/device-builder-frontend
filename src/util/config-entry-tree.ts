/**
 * Recursive walkers over a `ConfigEntry[]` tree: reveal advanced fields
 * under the caret and locate the first entry referenced by a
 * validation-error map.
 */

import type { ConfigEntry } from "../api/types/config-entries.js";
import { ConfigEntryType } from "../api/types/config-entries.js";
import type { ValidationError } from "./config-validation.js";
import { isIndexSegment } from "./nested-values.js";

/** True when `entries` contains any advanced entry, recursively. Drives whether
 *  the advanced-settings control shows at all: a nested advanced field reveals
 *  in place (it can't move to the bottom section), so the control must surface
 *  even when no *top-level* unit is advanced, or the field is unreachable. */
export function anyAdvancedEntry(entries: ConfigEntry[]): boolean {
  for (const entry of entries) {
    if (entry.advanced) return true;
    if (
      entry.type === ConfigEntryType.NESTED &&
      anyAdvancedEntry(entry.config_entries ?? [])
    ) {
      return true;
    }
  }
  return false;
}

/**
 * The entries a value path traverses, outermost first. List-index
 * segments are skipped: the schema nests an item's fields directly
 * under the list entry, with no index level. Null when the path
 * doesn't resolve.
 */
function entriesAlongPath(entries: ConfigEntry[], path: string[]): ConfigEntry[] | null {
  let level = entries;
  const chain: ConfigEntry[] = [];
  for (const key of path) {
    if (isIndexSegment(key)) continue;
    const entry = level.find((e) => e.key === key);
    if (!entry) return null;
    chain.push(entry);
    level = entry.config_entries ?? [];
  }
  return chain;
}

/** The entry a value path addresses; null when the path doesn't resolve. */
export function entryAtPath(entries: ConfigEntry[], path: string[]): ConfigEntry | null {
  const chain = entriesAlongPath(entries, path);
  return chain?.length ? chain[chain.length - 1] : null;
}

/**
 * Whether the entry at *path* — or any NESTED ancestor along it — is
 * `advanced`. Used to reveal a section's hidden advanced fields when the
 * caret or a backend error lands on one. False if the path doesn't
 * resolve.
 */
export function pathIsAdvanced(entries: ConfigEntry[], path: string[]): boolean {
  return entriesAlongPath(entries, path)?.some((e) => e.advanced) ?? false;
}

/** A declaring id field: creates an id rather than referencing one. */
export function isDeclaringIdEntry(entry: ConfigEntry | null): boolean {
  return entry?.type === ConfigEntryType.ID && !entry.references_component;
}

/**
 * Walk the entries in render order and return the first error target.
 * `path` is the dotted path of the failing leaf field;
 * `hasAdvancedAncestor` is true when the leaf itself or any
 * NESTED entry along the way is `advanced`.
 */
export function findFirstErrorTarget(
  entries: ConfigEntry[],
  errors: Map<string, ValidationError>,
  pathPrefix: string[] = [],
  ancestorAdvanced = false
): { path: string[]; hasAdvancedAncestor: boolean } | null {
  for (const entry of entries) {
    const path = [...pathPrefix, entry.key];
    const advancedHere = ancestorAdvanced || entry.advanced;
    if (entry.type === ConfigEntryType.NESTED) {
      const found = findFirstErrorTarget(
        entry.config_entries ?? [],
        errors,
        path,
        advancedHere
      );
      if (found) return found;
      continue;
    }
    if (errors.has(path.join("."))) {
      return { path, hasAdvancedAncestor: advancedHere };
    }
  }
  return null;
}
