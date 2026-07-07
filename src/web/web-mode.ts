/**
 * ESP ⇄ Pico mode, encoded in the URL query so a link is shareable and a
 * reload keeps the chosen device family (matching the legacy site's ``/?pico``
 * convention). ``esp`` is the default and carries no query param.
 */
export type WebMode = "esp" | "pico";

const PICO_PARAM = "pico";

/** Read the current mode from a query string (defaults to the live URL). */
export function readMode(search: string = window.location.search): WebMode {
  return new URLSearchParams(search).has(PICO_PARAM) ? "pico" : "esp";
}

/**
 * Build the ``?pico``-or-bare path for a mode, preserving any other query
 * params already present. Pure so it can be unit-tested and reused by the
 * header's link href.
 */
export function modeUrl(mode: WebMode, url: URL = new URL(window.location.href)): string {
  const next = new URL(url.toString());
  if (mode === "pico") {
    next.searchParams.set(PICO_PARAM, "");
  } else {
    next.searchParams.delete(PICO_PARAM);
  }
  // URLSearchParams renders an empty value as ``pico=``; the legacy site used a
  // bare ``?pico``. Normalize so the two match and the URL stays tidy.
  return next.pathname + next.search.replace(/=(?=&|$)/g, "") + next.hash;
}

/** Push a mode change into the address bar without a navigation/reload. */
export function writeMode(mode: WebMode): void {
  window.history.pushState(null, "", modeUrl(mode));
}
