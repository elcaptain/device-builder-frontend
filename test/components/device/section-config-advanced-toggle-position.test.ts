/**
 * @vitest-environment happy-dom
 *
 * Pins the advanced toggle in the section header (after the help text, above
 * the form) so revealing advanced fields can't push the control below the fold.
 */
import { render } from "lit";
import { describe, expect, it, vi } from "vitest";

vi.mock("sonner-js", () => ({
  default: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

import type { ConfigEntry } from "../../../src/api/types/config-entries.js";
import { ConfigEntryType } from "../../../src/api/types/config-entries.js";
import { ESPHomeDeviceSectionConfig } from "../../../src/components/device/device-section-config.js";

const entry = (key: string, advanced: boolean): ConfigEntry =>
  ({ key, type: ConfigEntryType.STRING, label: key, advanced }) as ConfigEntry;

/**
 * Render the host's template into a detached container. Detached so the
 * form-associated wa-children never run connectedCallback (noisy under
 * happy-dom); the DOM order we assert is set at render time regardless.
 */
function renderHost(showAdvanced: boolean): HTMLElement {
  const c = new ESPHomeDeviceSectionConfig();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inner = c as any;
  inner.sectionKey = "sensor.dht";
  inner.configuration = "device.yaml";
  inner.yaml = "";
  inner._config = {
    title: "DHT",
    entries: [entry("name", false), entry("update_interval", true)],
  };
  if (showAdvanced) inner._setShowAdvanced(true);
  const container = document.createElement("div");
  render(inner.render(), container);
  return container;
}

/** True when `a` appears before `b` in document order. */
function precedes(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

function assertToggleInHeaderAboveForm(container: HTMLElement) {
  const toggle = container.querySelector(".advanced-toggle-row");
  const form = container.querySelector("esphome-config-entry-form");
  expect(toggle).toBeTruthy();
  expect(form).toBeTruthy();
  // In the header info block (above the form) so it stays put when revealed.
  expect(toggle!.closest(".section-header-info")).toBeTruthy();
  expect(precedes(toggle!, form!)).toBe(true);
}

describe("device-section-config — advanced toggle position", () => {
  it("renders the toggle in the header, above the form", () => {
    assertToggleInHeaderAboveForm(renderHost(false));
  });

  it("keeps the toggle above the form after advanced is revealed", () => {
    assertToggleInHeaderAboveForm(renderHost(true));
  });
});
