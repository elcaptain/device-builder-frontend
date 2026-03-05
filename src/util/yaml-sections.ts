export interface YamlSection {
  key: string;
  fromLine: number; // 1-indexed (CodeMirror convention)
  toLine: number; // 1-indexed, inclusive
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
