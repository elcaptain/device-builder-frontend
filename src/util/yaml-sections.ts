export interface YamlSection {
  key: string;
  fromLine: number; // 1-indexed (CodeMirror convention)
  toLine: number; // 1-indexed, inclusive
}

export interface CategorizedSections {
  core: YamlSection[];
  components: YamlSection[];
  automations: YamlSection[];
}

// ESPHome system/platform keys → Core configuration
const CORE_KEYS = new Set([
  "esphome", "esp32", "esp8266", "rp2040", "bk72xx", "rtl87xx",
  "logger", "api", "ota", "wifi", "ethernet", "mqtt", "mdns",
  "network", "web_server", "captive_portal", "improv_serial",
  "safe_mode", "debug", "preferences", "external_components",
  "packages", "substitutions", "dashboard_import", "time",
]);

// Automation/logic keys → Automations
// In ESPHome, automations are inline on_* handlers within components.
// script, globals and interval are the standalone automation-adjacent top-level keys.
const AUTOMATION_KEYS = new Set([
  "script", "globals", "interval",
]);

export function categorizeSections(sections: YamlSection[]): CategorizedSections {
  const core: YamlSection[] = [];
  const components: YamlSection[] = [];
  const automations: YamlSection[] = [];

  for (const section of sections) {
    if (CORE_KEYS.has(section.key)) {
      core.push(section);
    } else if (AUTOMATION_KEYS.has(section.key)) {
      automations.push(section);
    } else {
      components.push(section);
    }
  }

  return { core, components, automations };
}

/**
 * Extracts top-level YAML keys and their line ranges.
 * Top-level keys have no leading whitespace (e.g. `esphome:`, `wifi:`).
 */
export function parseYamlTopLevelSections(yaml: string): YamlSection[] {
  const lines = yaml.split("\n");
  const sections: YamlSection[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^([a-zA-Z_][a-zA-Z0-9_]*):/);
    if (match) {
      if (sections.length > 0) {
        // Close the previous section at the CM line just before this one.
        // Array index i → CM line i+1, so the line before = CM line i.
        sections[sections.length - 1].toLine = i;
      }
      sections.push({
        key: match[1],
        fromLine: i + 1, // convert 0-indexed array to 1-indexed CM line
        toLine: lines.length,
      });
    }
  }

  // Trim the trailing empty line (yaml strings often end with \n)
  if (sections.length > 0 && lines[lines.length - 1] === "") {
    sections[sections.length - 1].toLine = lines.length - 1;
  }

  return sections;
}

/**
 * Finds inline ESPHome automation handlers (on_press:, on_value_range:, etc.)
 * nested inside component definitions and returns them as navigable sections.
 * The key is formatted as "<component name> → <event>" when a name is available.
 */
export function parseYamlAutomations(yaml: string): YamlSection[] {
  const lines = yaml.split("\n");
  const automations: YamlSection[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s+)(on_[a-zA-Z_]+):/);
    if (!match) continue;

    const indent = match[1].length;
    const eventName = match[2];
    const fromLine = i + 1; // 1-indexed CM line

    // End of block = first non-empty line at same or lower indentation
    let toLine = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim() === "") continue;
      const lineIndent = (lines[j].match(/^(\s*)/) ?? ["", ""])[1].length;
      if (lineIndent <= indent) {
        toLine = j; // array index j = CM line j (last line of this block is j-1+1 = j)
        break;
      }
    }

    // Look backwards for the nearest `name:` within the same component item
    let parentName = "";
    for (let j = i - 1; j >= 0; j--) {
      if (lines[j].match(/^[a-zA-Z]/)) break; // hit a top-level key
      const nameMatch = lines[j].match(/^\s+name:\s*["']?(.+?)["']?\s*$/);
      if (nameMatch) {
        parentName = nameMatch[1];
        break;
      }
    }

    automations.push({
      key: parentName ? `${parentName} → ${eventName}` : eventName,
      fromLine,
      toLine,
    });
  }

  return automations;
}
