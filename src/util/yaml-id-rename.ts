/**
 * Find and rewrite references to a component id across the YAML buffer.
 *
 * Same philosophy as config-entry-yaml-scan: pragmatic line scans over a
 * possibly mid-edit buffer, not a full YAML parse. A reference is an
 * identifier-shaped scalar equal to the id in value position (`key: id`,
 * `- key: id`, a bare `- id` list item) under a key that isn't known
 * free text, or an `id(...)` call inside a lambda. Declaring `id:` lines
 * of sections and list items are excluded — an `id:` nested deeper (an
 * automation action's target) is a reference.
 */
import type { ConfigEntry } from "../api/types/config-entries.js";
import { createScanMemo } from "./config-entry-yaml-scan.js";
import { splitInlineComment, stripQuotes } from "./yaml-scalar.js";
import { findFieldLine, parseYamlTopLevelSections } from "./yaml-sections-core.js";

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

interface Site {
  lineIdx: number;
  kind: "value" | "lambda";
  rewrite: (line: string, newId: string) => string;
}

/** 0-indexed lines that declare an `id:` for a section or list item. */
function declarationLines(yaml: string): Set<number> {
  const out = new Set<number>();
  for (const section of parseYamlTopLevelSections(yaml)) {
    const line = findFieldLine(yaml, section, ["id"]);
    if (line !== null) out.add(line - 1);
  }
  return out;
}

function scanSites(yaml: string, id: string, opts: IdScanOptions = {}): Site[] {
  const sites: Site[] = [];
  if (!id) return sites;
  const lines = yaml.split("\n");
  const declared = declarationLines(yaml);
  const lambdaRe = new RegExp(String.raw`\bid\(\s*${id}\s*\)`, "g");
  const from = (opts.excludeFromLine ?? 0) - 1;
  const to = (opts.excludeToLine ?? 0) - 1;

  for (let i = 0; i < lines.length; i++) {
    if (opts.excludeFromLine !== undefined && i >= from && i <= to) continue;
    const line = lines[i];
    const { value: content } = splitInlineComment(line);

    lambdaRe.lastIndex = 0;
    if (lambdaRe.test(content)) {
      sites.push({
        lineIdx: i,
        kind: "lambda",
        rewrite: (l, newId) =>
          l.replace(new RegExp(String.raw`\bid\(\s*${id}\s*\)`, "g"), `id(${newId})`),
      });
      continue;
    }
    if (declared.has(i)) continue;

    const pair = VALUE_LINE_RE.exec(content);
    if (pair && !FREETEXT_KEYS.has(pair[2]) && stripQuotes(pair[4].trim()) === id) {
      sites.push({
        lineIdx: i,
        kind: "value",
        rewrite: (l, newId) => replaceScalar(l, pair[1].length + pair[2].length, newId),
      });
      continue;
    }
    const bare = BARE_ITEM_RE.exec(content);
    if (bare && stripQuotes(bare[2].trim()) === id) {
      sites.push({
        lineIdx: i,
        kind: "value",
        rewrite: (l, newId) => replaceScalar(l, bare[1].length, newId),
      });
    }
  }
  return sites;
}

/** Swap the scalar token equal to the old id after *afterCol*, keeping
 *  quoting style, spacing, and any trailing comment. */
function replaceScalar(line: string, afterCol: number, newId: string): string {
  const { value: content, comment } = splitInlineComment(line);
  const head = content.slice(0, afterCol);
  const tail = content.slice(afterCol);
  const rewritten = tail.replace(
    /(:?\s*)(["']?)([^"'#]*?)(["']?)(\s*)$/,
    (_m, sep, q1, _old, q2, ws) => `${sep}${q1}${newId}${q2}${ws}`
  );
  return head + rewritten + comment;
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

interface CountKey {
  yaml: string;
  id: string;
}
const countMemo = createScanMemo<CountKey, number>(
  (a, b) => a.yaml === b.yaml && a.id === b.id
);

/** Memoised reference count for the ID field's awareness hint. */
export function countIdReferences(yaml: string, id: string): number {
  const key = { yaml, id };
  const hit = countMemo.get(key);
  if (hit !== undefined) return hit;
  const count = findIdReferences(yaml, id).length;
  countMemo.set(key, count);
  return count;
}

/** Rewrite every reference to *oldId* as *newId*; untouched lines stay
 *  byte-identical. */
export function renameIdReferences(
  yaml: string,
  oldId: string,
  newId: string,
  opts: IdScanOptions = {}
): string {
  const sites = scanSites(yaml, oldId, opts);
  if (!sites.length) return yaml;
  const lines = yaml.split("\n");
  for (const site of sites) {
    lines[site.lineIdx] = site.rewrite(lines[site.lineIdx], newId);
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
    const pair = VALUE_LINE_RE.exec(splitInlineComment(lines[lineIdx]).value);
    if (pair && stripQuotes(pair[4].trim()) === id) return true;
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
  const lambdaRe = new RegExp(String.raw`\bid\(\s*${oldId}\s*\)`, "g");
  const fixString = (s: string, entry: ConfigEntry | undefined): string => {
    if (entry?.references_component && s === oldId) return newId;
    return s.replace(lambdaRe, `id(${newId})`);
  };
  const walk = (val: unknown, entry: ConfigEntry | undefined): unknown => {
    if (typeof val === "string") return fixString(val, entry);
    if (Array.isArray(val)) {
      return val.map((item) =>
        typeof item === "string" ? fixString(item, entry) : walk(item, entry)
      );
    }
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

/** Test-only: clear the count memo. */
export function _clearIdRenameMemos(): void {
  countMemo.clear();
}
