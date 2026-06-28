/**
 * @vitest-environment happy-dom
 *
 * Behavior tests for the shared `renderAdvancedToggle` helper.
 */
import { render } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@home-assistant/webawesome/dist/components/switch/switch.js", () => ({}));

import type { LocalizeFunc } from "../../../src/common/localize.js";
import { renderAdvancedToggle } from "../../../src/components/device/advanced-toggle.js";

const localize: LocalizeFunc = (key, params) => {
  if (key === "device.show_advanced") return "Show advanced settings";
  if (key === "device.show_advanced_count")
    return `Show advanced settings (${params?.count})`;
  return key;
};

type SwitchEl = HTMLElement & { checked: boolean };

function mount(
  show: boolean,
  onChange: (show: boolean) => void,
  count?: number
): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  render(renderAdvancedToggle(show, localize, onChange, count), container);
  return container;
}

describe("renderAdvancedToggle", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reflects the show state and renders the localized label", () => {
    const container = mount(true, () => {});
    const sw = container.querySelector<SwitchEl>("wa-switch");
    expect(sw).not.toBeNull();
    expect(sw!.checked).toBe(true);
    expect(container.textContent).toContain("Show advanced settings");
  });

  it("appends the count to the label when one is given", () => {
    const container = mount(false, () => {}, 3);
    expect(container.textContent).toContain("Show advanced settings (3)");
  });

  it("omits the count for a zero count", () => {
    const container = mount(false, () => {}, 0);
    expect(container.textContent).toContain("Show advanced settings");
    expect(container.textContent).not.toContain("(0)");
  });

  it("reports the new checked value through onChange on change", () => {
    const onChange = vi.fn();
    const container = mount(false, onChange);
    const sw = container.querySelector<SwitchEl>("wa-switch")!;

    sw.checked = true;
    sw.dispatchEvent(new Event("change"));
    expect(onChange).toHaveBeenLastCalledWith(true);

    sw.checked = false;
    sw.dispatchEvent(new Event("change"));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });
});
