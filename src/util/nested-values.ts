/**
 * Helpers for reading and writing values inside a nested form-state
 * dict ({ key: value | { key: value } }). The renderers in
 * `<esphome-config-entry-form>` thread a `path: string[]` through every
 * field so a single component can edit values that may live arbitrarily
 * deep — e.g. `temperature.name` for a sub-entry inside a NESTED group.
 */

/**
 * Immutably set `value` at `path` inside an object, returning a new
 * object with structural sharing of untouched branches. Intermediate
 * objects are created when the path crosses missing or non-object
 * nodes (so a fresh form can write to nested fields).
 */
export function setIn(
  obj: Record<string, unknown>,
  path: string[],
  value: unknown,
): Record<string, unknown> {
  if (path.length === 0) return obj;
  const [head, ...rest] = path;
  if (rest.length === 0) return { ...obj, [head]: value };
  const child = obj[head];
  const childObj =
    child !== null && typeof child === "object" && !Array.isArray(child)
      ? (child as Record<string, unknown>)
      : {};
  return { ...obj, [head]: setIn(childObj, rest, value) };
}

/**
 * Read the value at `path` inside `obj`. Returns `undefined` for
 * missing paths or when the path crosses a non-object (e.g. trying to
 * descend into a string or array).
 */
export function getIn(
  obj: Record<string, unknown>,
  path: string[],
): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur === null || typeof cur !== "object" || Array.isArray(cur)) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}
