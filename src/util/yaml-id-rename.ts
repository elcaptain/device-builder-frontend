/**
 * Find and rewrite references to a component id across the YAML buffer.
 *
 * Same philosophy as config-entry-yaml-scan: pragmatic line scans over a
 * possibly mid-edit buffer, not a full YAML parse. A reference is an
 * identifier-shaped scalar equal to the id in value position (`key: id`,
 * `- key: id`, a bare `- id` list item, a `[a, b]` flow-sequence
 * element) under a key that isn't known free text, or an `id(...)` call
 * inside a lambda. Declaring `id:` lines of sections and list items are
 * excluded — an `id:` nested deeper (an automation action's target) is a
 * reference.
 *
 * Known tradeoff of the textual scan: a value that merely equals the id
 * under a key outside the free-text denylist (an enum value colliding
 * with a short id like `rgb`) reads as a reference. The schema would
 * disambiguate, but it isn't fetched for foreign sections; the denylist
 * covers the common prose/enum keys.
 */
import type { ConfigEntry } from "../api/types/config-entries.js";
import { createScanMemo } from "./config-entry-yaml-scan.js";
import { isValidEspHomeId } from "./esphome-id.js";
import { LIST_SECTIONS } from "./section-entry-overrides.js";
import { splitInlineComment, stripQuotes } from "./yaml-scalar.js";
import {
  findFieldLine,
  parseYamlTopLevelSections,
  readInstanceScalar,
} from "./yaml-sections-core.js";

export interface IdReferenceSite {
  /** 1-indexed line of the reference. */
  line: number;
  kind: "value" | "lambda";
}

/** Options shared by the finder and the renamer. */
export interface IdScanOptions {
  /** 1-indexed inclusive range to skip — the section being edited. */
  excludeFromLine?: number;
  excludeToLine?: number;
}

/** Keys whose values are prose or enums, never id references. */
const FREETEXT_KEYS = new Set([
  "name",
  "friendly_name",
  "comment",
  "ssid",
  "password",
  "platform",
  "device_class",
  "icon",
  "unit_of_measurement",
  "state_class",
  "entity_category",
  "restore_mode",
  "mode",
]);

/** `key: value` with an optional list dash; captures prefix, key, value. */
const VALUE_LINE_RE = /^(\s*(?:-\s+)?)([A-Za-z_][\w.]*)(:\s*)(\S.*)$/;
/** A bare `- value` sequence item; captures prefix and value. */
const BARE_ITEM_RE = /^(\s*-\s+)([^\s:#].*)$/;

/** `id(<id>)` lambda call. Safe to build from a validated identifier. */
const idCallRe = (id: string) => new RegExp(String.raw`\bid\(\s*${id}\s*\)`, "g");
/** The identifier as a standalone token. */
const idTokenRe = (id: string) => new RegExp(String.raw`\b${id}\b`, "g");

type Site =
  | { lineIdx: number; kind: "value"; afterCol: number }
  | { lineIdx: number; kind: "lambda" };

const declMemo = createScanMemo<string, Set<number>>((a, b) => a === b);

/** 0-indexed lines that declare an `id:` for a section or list item.
 *  LIST_SECTIONS blocks (globals) aren't expanded per item, so their
 *  item-level `id:` lines are collected by direct scan. */
function declarationLines(yaml: string): Set<number> {
  const hit = declMemo.get(yaml);
  if (hit) return hit;
  const out = new Set<number>();
  const lines = yaml.split("\n");
  for (const section of parseYamlTopLevelSections(yaml)) {
    if (LIST_SECTIONS.has(section.key)) {
      for (let i = section.fromLine - 1; i <= section.toLine - 1; i++) {
        if (readInstanceScalar(lines[i], "id") !== null) out.add(i);
      }
      continue;
    }
    const line = findFieldLine(yaml, section, ["id"]);
    if (line !== null) out.add(line - 1);
  }
  declMemo.set(yaml, out);
  return out;
}

/** Whether a value-position scalar or flow sequence carries *id*. */
function valueCarriesId(rawValue: string, id: string): boolean {
  if (rawValue.startsWith("[")) {
    return rawValue
      .slice(1, rawValue.lastIndexOf("]") < 0 ? undefined : rawValue.lastIndexOf("]"))
      .split(",")
      .some((tok) => stripQuotes(tok.trim()) === id);
  }
  return stripQuotes(rawValue) === id;
}

function scanSites(yaml: string, id: string, opts: IdScanOptions = {}): Site[] {
  const sites: Site[] = [];
  // Not identifier-shaped ⇒ can't be an ESPHome id ⇒ no sites. This also
  // keeps the RegExp construction below safe for arbitrary input.
  if (!isValidEspHomeId(id)) return sites;
  const lines = yaml.split("\n");
  const declared = declarationLines(yaml);
  const lambdaRe = idCallRe(id);
  const from = (opts.excludeFromLine ?? 0) - 1;
  const to = (opts.excludeToLine ?? 0) - 1;

  for (let i = 0; i < lines.length; i++) {
    if (opts.excludeFromLine !== undefined && i >= from && i <= to) continue;
    const { value: content } = splitInlineComment(lines[i]);

    if (content.includes("id(")) {
      lambdaRe.lastIndex = 0;
      if (lambdaRe.test(content)) {
        sites.push({ lineIdx: i, kind: "lambda" });
        continue;
      }
    }
    if (declared.has(i)) continue;

    const pair = VALUE_LINE_RE.exec(content);
    if (pair) {
      if (!FREETEXT_KEYS.has(pair[2]) && valueCarriesId(pair[4].trim(), id)) {
        sites.push({
          lineIdx: i,
          kind: "value",
          afterCol: pair[1].length + pair[2].length,
        });
      }
      continue;
    }
    const bare = BARE_ITEM_RE.exec(content);
    if (bare && stripQuotes(bare[2].trim()) === id) {
      sites.push({ lineIdx: i, kind: "value", afterCol: bare[1].length });
    }
  }
  return sites;
}

/** Swap standalone tokens equal to the old id after *afterCol*, keeping
 *  quoting style, spacing, and any trailing comment. Identifier `\b`
 *  boundaries can't match inside a longer id. */
function rewriteValue(
  line: string,
  afterCol: number,
  tokenRe: RegExp,
  newId: string
): string {
  const { value: content, comment } = splitInlineComment(line);
  return (
    content.slice(0, afterCol) + content.slice(afterCol).replace(tokenRe, newId) + comment
  );
}

/**
 * Every reference to *id* in the buffer, excluding its declarations and
 * the optional excluded line range (the section being edited).
 */
export function findIdReferences(
  yaml: string,
  id: string,
  opts: IdScanOptions = {}
): IdReferenceSite[] {
  return scanSites(yaml, id, opts).map((s) => ({ line: s.lineIdx + 1, kind: s.kind }));
}

// Keyed on the buffer, holding per-id counts: a form renders several
// declaring ID fields (nested entities), and a single-entry (yaml, id)
// memo would thrash across them on every render.
const countMemo = createScanMemo<string, Map<string, number>>((a, b) => a === b);

/** Memoised reference count for the ID field's awareness hint. */
export function countIdReferences(yaml: string, id: string): number {
  let counts = countMemo.get(yaml);
  if (!counts) {
    counts = new Map();
    countMemo.set(yaml, counts);
  }
  const hit = counts.get(id);
  if (hit !== undefined) return hit;
  const count = findIdReferences(yaml, id).length;
  counts.set(id, count);
  return count;
}

/** Rewrite every reference to *oldId* as *newId*; untouched lines stay
 *  byte-identical and the line count never changes. */
export function renameIdReferences(
  yaml: string,
  oldId: string,
  newId: string,
  opts: IdScanOptions = {}
): string {
  const sites = scanSites(yaml, oldId, opts);
  if (!sites.length) return yaml;
  const lines = yaml.split("\n");
  const lambdaRe = idCallRe(oldId);
  const tokenRe = idTokenRe(oldId);
  for (const site of sites) {
    lines[site.lineIdx] =
      site.kind === "lambda"
        ? lines[site.lineIdx].replace(lambdaRe, `id(${newId})`)
        : rewriteValue(lines[site.lineIdx], site.afterCol, tokenRe, newId);
  }
  return lines.join("\n");
}

/** Whether *id* is declared as a section or list-item `id:` outside the
 *  excluded range — renaming references then would break the survivor. */
export function idDeclaredElsewhere(
  yaml: string,
  id: string,
  opts: IdScanOptions = {}
): boolean {
  const lines = yaml.split("\n");
  const from = (opts.excludeFromLine ?? 0) - 1;
  const to = (opts.excludeToLine ?? 0) - 1;
  for (const lineIdx of declarationLines(yaml)) {
    if (opts.excludeFromLine !== undefined && lineIdx >= from && lineIdx <= to) {
      continue;
    }
    if (readInstanceScalar(lines[lineIdx], "id") === id) return true;
  }
  return false;
}

/**
 * Rewrite references to *oldId* inside the edited section's own draft
 * values: string leaves whose entry has references_component, plus
 * id(old) calls in any string leaf (lambdas). Schema-precise where the
 * buffer scan can't be — the section splices from these values, so they
 * must agree with the cross-section rewrite.
 */
export function renameIdInValues(
  values: Record<string, unknown>,
  entries: ConfigEntry[],
  oldId: string,
  newId: string
): Record<string, unknown> {
  if (!isValidEspHomeId(oldId)) return values;
  const lambdaRe = idCallRe(oldId);
  const fixString = (s: string, entry: ConfigEntry | undefined): string => {
    if (entry?.references_component && s === oldId) return newId;
    return s.replace(lambdaRe, `id(${newId})`);
  };
  const walk = (val: unknown, entry: ConfigEntry | undefined): unknown => {
    if (typeof val === "string") return fixString(val, entry);
    if (Array.isArray(val)) return val.map((item) => walk(item, entry));
    if (val && typeof val === "object") {
      const level = entry ? (entry.config_entries ?? []) : entries;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val)) {
        out[k] = walk(
          v,
          level.find((e) => e.key === k)
        );
      }
      return out;
    }
    return val;
  };
  return walk(values, undefined) as Record<string, unknown>;
}

/** Test-only: clear the scan memos. */
export function _clearIdRenameMemos(): void {
  countMemo.clear();
  declMemo.clear();
}
