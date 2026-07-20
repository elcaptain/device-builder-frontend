/**
 * Legacy deep-link hints. The classic ESPHome dashboard
 * (``esphome/dashboard``) opens web.esphome.io with ``?dashboard_logs`` /
 * ``?dashboard_install`` / ``?dashboard_wizard`` to steer the user toward a
 * specific ESP action after they connect (view logs, install a downloaded
 * project, or prepare the device for first use). The new dashboard doesn't use
 * these — this only keeps the legacy deep-links from landing hint-less.
 *
 * These map to ESP device-card actions; Pico has no equivalent, so the caller
 * only surfaces the hint in ESP mode (matching the legacy ESP-only promos).
 */
export type DashboardHint = "logs" | "install" | "wizard";

const HINT_PARAMS: Record<string, DashboardHint> = {
  dashboard_logs: "logs",
  dashboard_install: "install",
  dashboard_wizard: "wizard",
};

/**
 * Read the first ``dashboard_*`` hint param from a query string (defaults to
 * the live URL). First match wins, mirroring the legacy site's behaviour.
 */
export function parseDashboardHint(
  search: string = window.location.search
): DashboardHint | null {
  const params = new URLSearchParams(search);
  for (const key of params.keys()) {
    const hint = HINT_PARAMS[key];
    if (hint) return hint;
  }
  return null;
}
