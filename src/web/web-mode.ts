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
  // Drop any existing pico param, then re-append it bare for pico mode. Other
  // params keep their exact ``key=value`` (or empty ``key=``) semantics —
  // building the string by hand avoids the URLSearchParams ``pico=`` form
  // without touching unrelated params.
  next.searchParams.delete(PICO_PARAM);
  let search = next.search;
  if (mode === "pico") {
    // Legacy site used a bare ``?pico`` (no ``=``).
    search = search ? `${search}&${PICO_PARAM}` : `?${PICO_PARAM}`;
  }
  return next.pathname + search + next.hash;
}

/** Push a mode change into the address bar without a navigation/reload. */
export function writeMode(mode: WebMode): void {
  window.history.pushState(null, "", modeUrl(mode));
}
