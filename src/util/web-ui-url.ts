import type { ConfiguredDevice } from "../api/types.js";

/**
 * Return *url* if it parses cleanly and uses ``http:`` or ``https:``;
 * empty string otherwise.
 *
 * Shared guard for any user-clickable link whose value comes from
 * device-side data (mDNS, YAML, etc.). Without it, a hostile
 * announcement could surface a ``javascript:`` URL that runs code
 * when the user clicks the resulting ``<a href>``. ``new URL``
 * rejects malformed input; the protocol check covers the rest.
 *
 * The original string is returned verbatim (rather than
 * ``parsed.toString()``) so callers keep the terse form
 * ``http://host:22`` instead of the WHATWG-canonicalised
 * ``http://host:22/``.
 */
export function safeWebUiUrl(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return url;
  } catch {
    return "";
  }
}

/**
 * Wrap *host* in the URL-host shape — IPv6 literals get the
 * RFC 3986 brackets and a percent-encoded zone-id separator
 * (``fe80::1%en0`` → ``[fe80::1%25en0]``); IPv4 literals and
 * hostnames pass through unchanged. Without this, ``new URL`` in
 * ``safeWebUiUrl`` rejected raw IPv6 hosts entirely and the
 * Visit-Web-UI link disappeared for V6-only devices. Global IPv6
 * literals now produce a usable link; scoped (link-local) ones are
 * still rejected downstream because WHATWG ``new URL`` doesn't
 * accept zone IDs at all — that's the right outcome since browsers
 * can't route link-local without an OS interface scope anyway.
 */
function _wrapHost(host: string): string {
  if (!host.includes(":")) return host;
  // ``replaceAll`` (not ``replace``) so a malformed input with more
  // than one ``%`` can't leak an unencoded one through — valid IPv6
  // only has the single zone-id separator, but defensive escaping
  // costs nothing and silences CodeQL's "incomplete string escaping"
  // rule.
  return `[${host.replaceAll("%", "%25")}]`;
}

/**
 * Build the device's web-UI URL, or return ``""`` when the YAML didn't
 * expose a ``web_server`` port or we don't have a host to point at.
 *
 * Single source of truth for the dashboard's "Visit Web UI" affordance —
 * the table column, the device card, and the row-menu fallback all
 * share this so the host/port/protocol logic can't drift between
 * call sites. Returns empty string (not ``null``) so callers can
 * skip-render with a truthy check.
 */
export function buildWebUiUrl(device: ConfiguredDevice): string {
  if (device.web_port == null) return "";
  const host = device.address || device.ip;
  if (!host) return "";
  return safeWebUiUrl(
    `http://${_wrapHost(host)}${device.web_port === 80 ? "" : `:${device.web_port}`}`,
  );
}
