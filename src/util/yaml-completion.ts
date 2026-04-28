import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";
import type { ESPHomeAPI } from "../api/index.js";
import type {
  ComponentCatalogEntry,
  ConfigEntry,
} from "../api/types.js";

interface Catalog {
  byId: Map<string, ComponentCatalogEntry>;
  byCategory: Map<string, ComponentCatalogEntry[]>;
  all: ComponentCatalogEntry[];
}

let cache: Promise<Catalog> | null = null;

function loadCatalog(api: ESPHomeAPI): Promise<Catalog> {
  if (!cache) {
    cache = api
      .getComponents({ limit: 2000 })
      .then((r): Catalog => {
        const byId = new Map<string, ComponentCatalogEntry>();
        const byCategory = new Map<string, ComponentCatalogEntry[]>();
        for (const c of r.components) {
          byId.set(c.id, c);
          const list = byCategory.get(c.category) ?? [];
          list.push(c);
          byCategory.set(c.category, list);
        }
        return { byId, byCategory, all: r.components };
      })
      .catch(() => {
        cache = null;
        return { byId: new Map(), byCategory: new Map(), all: [] };
      });
  }
  return cache;
}

export function createYamlCompletion(api: ESPHomeAPI) {
  return autocompletion({
    activateOnTyping: true,
    override: [(ctx) => completionSource(ctx, api)],
  });
}

async function completionSource(
  ctx: CompletionContext,
  api: ESPHomeAPI
): Promise<CompletionResult | null> {
  const catalog = await loadCatalog(api);
  if (catalog.all.length === 0) return null;

  const { state, pos } = ctx;
  const line = state.doc.lineAt(pos);
  const beforeCursor = line.text.slice(0, pos - line.from);

  // Detect value position: cursor sits after a key's colon on this line.
  const keyColon = beforeCursor.match(/^(\s*-\s+)?(\w+)\s*:\s*/);
  if (keyColon && pos - line.from >= keyColon[0].length) {
    const valuePart = beforeCursor.slice(keyColon[0].length);
    if (!/\s/.test(valuePart)) {
      return valueCompletion(
        state,
        line.number,
        keyColon[2],
        pos - valuePart.length,
        catalog,
        ctx
      );
    }
  }

  // Key position.
  const wordMatch = beforeCursor.match(/(\w*)$/);
  const word = wordMatch?.[1] ?? "";
  const wordStart = pos - word.length;
  if (!word && !ctx.explicit) return null;

  // Skip when cursor is inside a list-item dash with no key yet ("- |" alone).
  const indent = (line.text.match(/^(\s*)/)?.[1].length) ?? 0;

  if (indent === 0) {
    return rootCompletion(catalog, wordStart);
  }
  return keyCompletion(state, line.number, indent, wordStart, catalog);
}

// ─── Value completion ────────────────────────────────────────────────

function valueCompletion(
  state: EditorState,
  lineNumber: number,
  key: string,
  from: number,
  catalog: Catalog,
  ctx: CompletionContext
): CompletionResult | null {
  // `platform:` is special — suggest components matching the parent block category.
  if (key === "platform") {
    const list = findListContext(state, lineNumber);
    const block = list?.parentBlock ?? findRootBlock(state, lineNumber);
    if (!block) return null;
    const platforms = catalog.byCategory.get(block) ?? [];
    if (platforms.length === 0) return null;
    return {
      from,
      options: platforms.map((c) => componentToCompletion(c)),
      validFor: /^[\w.-]*$/,
    };
  }

  const entry = findConfigEntry(state, lineNumber, key, catalog);
  if (!entry) return null;
  return entryValueCompletion(entry, from, ctx);
}

function entryValueCompletion(
  entry: ConfigEntry,
  from: number,
  ctx: CompletionContext
): CompletionResult | null {
  const options: Completion[] = [];

  if (entry.type === "boolean") {
    options.push({ label: "true", type: "constant", boost: 1 });
    options.push({ label: "false", type: "constant" });
  } else if (entry.options && entry.options.length > 0) {
    for (const o of entry.options) {
      options.push({
        label: o.value,
        type: "enum",
        detail: o.label !== o.value ? o.label : undefined,
      });
    }
  }

  if (
    options.length === 0 &&
    ctx.explicit &&
    entry.default_value !== null &&
    entry.default_value !== undefined &&
    entry.default_value !== ""
  ) {
    options.push({
      label: String(entry.default_value),
      type: "text",
      detail: "default",
    });
  }

  if (options.length === 0) return null;
  return { from, options, validFor: /^[\w.-]*$/ };
}

// ─── Key completion ──────────────────────────────────────────────────

function rootCompletion(catalog: Catalog, from: number): CompletionResult {
  const options = catalog.all.map((c) => {
    const completion = componentToCompletion(c);
    return { ...completion, apply: `${c.id}:\n  ` };
  });
  return { from, options, validFor: /^\w*$/ };
}

function keyCompletion(
  state: EditorState,
  lineNumber: number,
  indent: number,
  from: number,
  catalog: Catalog
): CompletionResult | null {
  // Inside a list item under a platform block — use the platform's schema.
  const list = findListContext(state, lineNumber);
  if (list?.platform) {
    const component = catalog.byId.get(list.platform);
    if (component) {
      // Always offer `platform:` first if the list item doesn't have one yet.
      const entries = component.config_entries;
      const hasPlatform = listItemHasKey(state, lineNumber, list.listItemIndent, "platform");
      const opts: Completion[] = [];
      if (!hasPlatform) opts.push(platformKeyCompletion());
      for (const e of entries) opts.push(configEntryToCompletion(e));
      if (opts.length === 0) return null;
      return { from, options: opts, validFor: /^\w*$/ };
    }
  }

  // Bare list item (no platform yet) under a known platform block — suggest `platform:`.
  if (list && !list.platform) {
    return {
      from,
      options: [platformKeyCompletion()],
      validFor: /^\w*$/,
    };
  }

  // Direct child of a known top-level component (single-config style).
  const parent = findDirectParent(state, lineNumber, indent);
  if (!parent) return null;
  const component = catalog.byId.get(parent);
  if (!component || component.config_entries.length === 0) return null;
  return {
    from,
    options: component.config_entries.map((e) => configEntryToCompletion(e)),
    validFor: /^\w*$/,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function componentToCompletion(c: ComponentCatalogEntry): Completion {
  const info = c.docs_url
    ? `${c.description}\n\n${c.docs_url}`
    : c.description || undefined;
  return {
    label: c.id,
    type: "type",
    detail: c.name,
    info,
    boost: c.category === "core" ? 2 : 0,
  };
}

function configEntryToCompletion(entry: ConfigEntry): Completion {
  const detailParts = [entry.label];
  if (entry.required) detailParts.push("required");
  return {
    label: entry.key,
    type: typeFor(entry.type),
    detail: detailParts.join(" · "),
    info: entry.description ?? undefined,
    apply: `${entry.key}: `,
    boost: entry.required ? 5 : entry.advanced ? -5 : 0,
  };
}

function platformKeyCompletion(): Completion {
  return {
    label: "platform",
    type: "keyword",
    detail: "required",
    apply: "platform: ",
    boost: 10,
  };
}

function typeFor(t: string): string {
  switch (t) {
    case "boolean":
      return "constant";
    case "integer":
    case "float":
      return "number";
    case "string":
    case "secure_string":
      return "text";
    case "select":
      return "enum";
    case "pin":
      return "variable";
    case "time_period":
      return "keyword";
    default:
      return "property";
  }
}

interface ListInfo {
  parentBlock: string;
  platform: string | null;
  listItemIndent: number;
}

function findListContext(
  state: EditorState,
  lineNumber: number
): ListInfo | null {
  const currentLine = state.doc.line(lineNumber);
  const currentIndent = (currentLine.text.match(/^(\s*)/)?.[1].length) ?? 0;
  let listItemIndent = -1;
  let platform: string | null = null;

  for (let i = lineNumber; i >= 1; i--) {
    const ln = state.doc.line(i);
    const text = ln.text;
    if (!text.trim() || text.trim().startsWith("#")) continue;
    const lineIndent = (text.match(/^(\s*)/)?.[1].length) ?? 0;

    if (listItemIndent === -1) {
      if (/^\s*-\s/.test(text) && lineIndent < currentIndent) {
        listItemIndent = lineIndent;
        const inline = text.match(/^\s*-\s+platform\s*:\s*(\S+)/);
        if (inline) platform = inline[1];
        continue;
      }
      // Same-indent: look for platform key (e.g., cursor sits below `pin: D2` and platform was earlier).
      if (lineIndent === currentIndent && i !== lineNumber) {
        const m = text.match(/^\s*platform\s*:\s*(\S+)/);
        if (m && !platform) platform = m[1];
      }
      continue;
    }

    if (lineIndent > listItemIndent && !platform) {
      const m = text.match(/^\s*platform\s*:\s*(\S+)/);
      if (m) platform = m[1];
      continue;
    }

    if (lineIndent === 0) {
      const m = text.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
      if (m) {
        return { parentBlock: m[1], platform, listItemIndent };
      }
      return null;
    }
  }
  return null;
}

function listItemHasKey(
  state: EditorState,
  lineNumber: number,
  listItemIndent: number,
  key: string
): boolean {
  for (let i = lineNumber; i >= 1; i--) {
    const ln = state.doc.line(i);
    const text = ln.text;
    if (!text.trim()) continue;
    const lineIndent = (text.match(/^(\s*)/)?.[1].length) ?? 0;
    if (lineIndent < listItemIndent) return false;
    if (lineIndent === listItemIndent && /^\s*-\s/.test(text)) {
      const inline = text.match(new RegExp(`^\\s*-\\s+${key}\\s*:`));
      return Boolean(inline);
    }
    if (lineIndent > listItemIndent) {
      if (new RegExp(`^\\s*${key}\\s*:`).test(text)) return true;
    }
  }
  return false;
}

function findRootBlock(state: EditorState, lineNumber: number): string | null {
  for (let i = lineNumber - 1; i >= 1; i--) {
    const ln = state.doc.line(i);
    const text = ln.text;
    if (!text.trim() || text.trim().startsWith("#")) continue;
    const lineIndent = (text.match(/^(\s*)/)?.[1].length) ?? 0;
    if (lineIndent === 0) {
      const m = text.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
      return m ? m[1] : null;
    }
  }
  return null;
}

function findDirectParent(
  state: EditorState,
  lineNumber: number,
  currentIndent: number
): string | null {
  for (let i = lineNumber - 1; i >= 1; i--) {
    const ln = state.doc.line(i);
    const text = ln.text;
    if (!text.trim() || text.trim().startsWith("#")) continue;
    const lineIndent = (text.match(/^(\s*)/)?.[1].length) ?? 0;
    if (lineIndent >= currentIndent) continue;
    const m = text.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(?:#.*)?$/);
    return m ? m[1] : null;
  }
  return null;
}

function findConfigEntry(
  state: EditorState,
  lineNumber: number,
  key: string,
  catalog: Catalog
): ConfigEntry | null {
  // Component context: list item's platform takes precedence, else direct parent.
  const list = findListContext(state, lineNumber);
  let componentId = list?.platform ?? null;
  if (!componentId) {
    const currentLine = state.doc.line(lineNumber);
    const indent = (currentLine.text.match(/^(\s*)/)?.[1].length) ?? 0;
    componentId = findDirectParent(state, lineNumber, indent);
  }
  if (!componentId) return null;
  const component = catalog.byId.get(componentId);
  if (!component) return null;
  return component.config_entries.find((e) => e.key === key) ?? null;
}
