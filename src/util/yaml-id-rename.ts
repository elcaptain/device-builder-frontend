/**
 * Find and rewrite references to a component id across the YAML buffer.
 *
 * Same philosophy as config-entry-yaml-scan: pragmatic line scans over a
 * possibly mid-edit buffer, not a full YAML parse. Which values can hold
 * an id comes from the schema, not from guessing by key name:
 *
 * - a non-declaring `id:` value (an automation action's target) and a
 *   dotted action-shorthand value (`- switch.turn_on: relay1`) are
 *   references by ESPHome convention, buffer-wide;
 * - a `key: value` / bare `- value` / `[a, b]` flow-sequence value is a
 *   reference only when the containing section's cached catalog entry
 *   marks that key `references_component` (the same schema the reference
 *   dropdowns and YAML completion resolve against);
 * - `substitutions:` values are literal splice text, so any of them can
 *   carry the id;
 * - `id(...)` calls inside lambdas are references anywhere.
 *
 * A section whose schema isn't cached contributes no schema-keyed sites
 * (the universal rules above still apply inside it) — the navigator
 * prefetches every present section's schema, so in practice the cache is
 * warm. Known tradeoff: a dotted action shorthand whose scalar isn't a
 * target (`logger.log: msg`) reads as a reference when the message
 * exactly equals the id.
 */
import type { ConfigEntry } from "../api/types/config-entries.js";
import { getCachedComponent, subscribeComponentCache } from "./component-name-cache.js";
import { createScanMemo } from "./config-entry-yaml-scan.js";
import { isValidEspHomeId } from "./esphome-id.js";
import { LIST_SECTIONS } from "./section-entry-overrides.js";
import { splitInlineComment, stripQuotes } from "./yaml-scalar.js";
import {
  findFieldLine,
  parseYamlTopLevelSections,
  readInstanceScalar,
} from "./yaml-sections-core.js";
import { sectionKeyOf } from "./yaml-sections.js";

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
  /** Device chip platform (`esp32`, …) — the component-cache bucket the
   *  app fetches section schemas into. */
  platform?: string;
}

/** `key:` with an optional list dash and optional inline value;
 *  captures prefix, key, value (undefined for a block-opening key). */
const PAIR_LINE_RE = /^(\s*(?:-\s+)?)([A-Za-z_][\w.]*)(:\s*)(\S.*)?$/;
/** A bare `- value` sequence item; captures prefix and value. */
const BARE_ITEM_RE = /^(\s*)-\s+([^\s:#].*)$/;

/** `id(<id>)` lambda call. Safe to build from a validated identifier. */
const idCallRe = (id: string) => new RegExp(String.raw`\bid\(\s*${id}\s*\)`, "g");
/** The identifier as a standalone token. */
const idTokenRe = (id: string) => new RegExp(String.raw`\b${id}\b`, "g");

type Site =
  | { lineIdx: number; kind: "value"; afterCol: number }
  | { lineIdx: number; kind: "lambda" };

// The section contexts depend on the component cache, which fills as
// schemas arrive; the generation busts the memos when it does.
let cacheGen = 0;
subscribeComponentCache(() => {
  cacheGen++;
});

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

interface SectionScanCtx {
  fromIdx: number; // 0-indexed inclusive
  toIdx: number;
  /** Keys the section's schema marks `references_component`; null when
   *  the schema isn't cached — schema-keyed matching is skipped then. */
  refKeys: ReadonlySet<string> | null;
  /** `substitutions:` — every value is spliced text, any may carry the id. */
  allValues: boolean;
}

function collectRefKeys(entries: ConfigEntry[], out: Set<string>): void {
  for (const e of entries) {
    if (e.references_component) out.add(e.key);
    if (e.config_entries) collectRefKeys(e.config_entries, out);
  }
}

interface SectionCtxKey {
  yaml: string;
  platform: string | undefined;
  gen: number;
}

const sectionCtxMemo = createScanMemo<SectionCtxKey, SectionScanCtx[]>(
  (a, b) => a.yaml === b.yaml && a.platform === b.platform && a.gen === b.gen
);

function sectionScanCtxs(yaml: string, platform: string | undefined): SectionScanCtx[] {
  const key = { yaml, platform, gen: cacheGen };
  const hit = sectionCtxMemo.get(key);
  if (hit) return hit;
  const out: SectionScanCtx[] = [];
  for (const section of parseYamlTopLevelSections(yaml)) {
    const fromIdx = section.fromLine - 1;
    const toIdx = section.toLine - 1;
    if (section.key === "substitutions") {
      out.push({ fromIdx, toIdx, refKeys: null, allValues: true });
      continue;
    }
    const comp = getCachedComponent(sectionKeyOf(section), platform);
    let refKeys: Set<string> | null = null;
    if (comp) {
      refKeys = new Set();
      collectRefKeys(comp.config_entries ?? [], refKeys);
    }
    out.push({ fromIdx, toIdx, refKeys, allValues: false });
  }
  sectionCtxMemo.set(key, out);
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

/** Whether *key* can hold an id reference in this section context. */
function keyHoldsReference(key: string, sctx: SectionScanCtx | undefined): boolean {
  if (key === "id" || key.includes(".")) return true;
  if (!sctx) return false;
  return sctx.allValues || (sctx.refKeys?.has(key) ?? false);
}

function scanSites(yaml: string, id: string, opts: IdScanOptions = {}): Site[] {
  const sites: Site[] = [];
  // Not identifier-shaped ⇒ can't be an ESPHome id ⇒ no sites. This also
  // keeps the RegExp construction below safe for arbitrary input.
  if (!isValidEspHomeId(id)) return sites;
  const lines = yaml.split("\n");
  const declared = declarationLines(yaml);
  const sections = sectionScanCtxs(yaml, opts.platform);
  const lambdaRe = idCallRe(id);
  const from = (opts.excludeFromLine ?? 0) - 1;
  const to = (opts.excludeToLine ?? 0) - 1;

  // Nearest enclosing `key:` per indent, for attributing bare `- value`
  // items to the key whose block they sit in.
  const keyStack: { indent: number; key: string }[] = [];
  let sectionIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    while (sectionIdx < sections.length && sections[sectionIdx].toIdx < i) sectionIdx++;
    const sctx =
      sectionIdx < sections.length && sections[sectionIdx].fromIdx <= i
        ? sections[sectionIdx]
        : undefined;
    const excluded = opts.excludeFromLine !== undefined && i >= from && i <= to;
    const { value: content } = splitInlineComment(lines[i]);

    if (!excluded && content.includes("id(")) {
      lambdaRe.lastIndex = 0;
      if (lambdaRe.test(content)) {
        sites.push({ lineIdx: i, kind: "lambda" });
        continue;
      }
    }

    const pair = PAIR_LINE_RE.exec(content);
    if (pair) {
      const indent = pair[1].length;
      while (keyStack.length && keyStack[keyStack.length - 1].indent >= indent) {
        keyStack.pop();
      }
      keyStack.push({ indent, key: pair[2] });
      if (
        !excluded &&
        pair[4] !== undefined &&
        !declared.has(i) &&
        keyHoldsReference(pair[2], sctx) &&
        valueCarriesId(pair[4].trim(), id)
      ) {
        sites.push({ lineIdx: i, kind: "value", afterCol: indent + pair[2].length });
      }
      continue;
    }
    const bare = BARE_ITEM_RE.exec(content);
    if (bare) {
      // A dash at the owning key's own indent is still its item, so only
      // deeper keys are popped.
      const indent = bare[1].length;
      while (keyStack.length && keyStack[keyStack.length - 1].indent > indent) {
        keyStack.pop();
      }
      const parent = keyStack[keyStack.length - 1];
      if (
        !excluded &&
        parent &&
        keyHoldsReference(parent.key, sctx) &&
        stripQuotes(bare[2].trim()) === id
      ) {
        sites.push({
          lineIdx: i,
          kind: "value",
          afterCol: content.length - bare[2].length,
        });
      }
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

interface CountKey {
  yaml: string;
  platform: string | undefined;
  gen: number;
}

// Keyed on the buffer, holding per-id counts: a form renders several
// declaring ID fields (nested entities), and a single-entry (yaml, id)
// memo would thrash across them on every render.
const countMemo = createScanMemo<CountKey, Map<string, number>>(
  (a, b) => a.yaml === b.yaml && a.platform === b.platform && a.gen === b.gen
);

/** Memoised reference count for the ID field's awareness hint. */
export function countIdReferences(yaml: string, id: string, platform?: string): number {
  const key = { yaml, platform, gen: cacheGen };
  let counts = countMemo.get(key);
  if (!counts) {
    counts = new Map();
    countMemo.set(key, counts);
  }
  const hit = counts.get(id);
  if (hit !== undefined) return hit;
  const count = findIdReferences(yaml, id, { platform }).length;
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
  sectionCtxMemo.clear();
}
