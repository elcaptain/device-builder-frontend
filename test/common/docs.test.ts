import { describe, expect, it } from "vitest";

import { esphomeWebUrl } from "../../src/common/docs.js";

describe("esphomeWebUrl", () => {
  it("returns the bare ESPHome Web URL with no hint", () => {
    expect(esphomeWebUrl()).toBe("https://web.esphome.io/");
  });

  it("appends the ?dashboard_<hint> guide for each hint", () => {
    expect(esphomeWebUrl("wizard")).toBe("https://web.esphome.io/?dashboard_wizard");
    expect(esphomeWebUrl("install")).toBe("https://web.esphome.io/?dashboard_install");
    expect(esphomeWebUrl("logs")).toBe("https://web.esphome.io/?dashboard_logs");
  });
});
