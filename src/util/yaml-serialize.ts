/**
 * Minimal YAML serializer for ConfigEntry form values. Used by the
 * device section editor (to write a section back into the device YAML)
 * and the "Add component" dialog (to render a live preview).
 *
 * The serializer is deliberately small — it doesn't aim to handle
 * every YAML feature, just the shape our form values take:
 *   - scalars (string / number / boolean)
 *   - arrays of scalars (block lists)
 *   - nested objects (recurse)
 *
 * Empty / null / undefined values are skipped so optional fields the
 * user didn't fill don't end up in the output.
 */

/**
 * Serialize a values dict as YAML lines at the given indent.
 * Returns an array of lines (not a joined string) so callers can
 * splice them into existing YAML when needed.
 */
export function serializeYamlValues(
  values: Record<string, unknown>,
  indent: string,
): string[] {
  const lines: string[] = [];
  for (const [key, val] of Object.entries(values)) {
    if (val === undefined || val === null || val === "") continue;
    if (Array.isArray(val)) {
      if (val.length === 0) continue;
      lines.push(`${indent}${key}:`);
      for (const item of val) {
        lines.push(`${indent}  - ${formatYamlScalar(item)}`);
      }
      continue;
    }
    if (typeof val === "object") {
      const sub = serializeYamlValues(
        val as Record<string, unknown>,
        `${indent}  `,
      );
      if (sub.length === 0) continue;
      lines.push(`${indent}${key}:`);
      lines.push(...sub);
      continue;
    }
    lines.push(`${indent}${key}: ${formatYamlScalar(val)}`);
  }
  return lines;
}

/** Format a single scalar value, quoting when needed. */
export function formatYamlScalar(v: unknown): string {
  if (typeof v === "boolean") return String(v);
  if (typeof v === "number") return String(v);
  const s = String(v);
  if (/[:#]/.test(s) || /^[-\s'"]/.test(s) || /\s$/.test(s)) {
    return `"${s.replace(/"/g, '\\"')}"`;
  }
  return s;
}
