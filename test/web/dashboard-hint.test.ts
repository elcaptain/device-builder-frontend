import { describe, expect, it } from "vitest";

import { parseDashboardHint } from "../../src/web/dashboard-hint.js";

describe("parseDashboardHint", () => {
  it("maps each legacy dashboard_* param to its hint", () => {
    expect(parseDashboardHint("?dashboard_logs")).toBe("logs");
    expect(parseDashboardHint("?dashboard_install")).toBe("install");
    expect(parseDashboardHint("?dashboard_wizard")).toBe("wizard");
  });

  it("returns null when no hint param is present", () => {
    expect(parseDashboardHint("")).toBeNull();
    expect(parseDashboardHint("?pico")).toBeNull();
    expect(parseDashboardHint("?foo=bar")).toBeNull();
  });

  it("ignores an unknown dashboard_* param", () => {
    expect(parseDashboardHint("?dashboard_unknown")).toBeNull();
  });

  it("first known hint wins, alongside other params", () => {
    expect(parseDashboardHint("?pico&dashboard_logs")).toBe("logs");
  });
});
