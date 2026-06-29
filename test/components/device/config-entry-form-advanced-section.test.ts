/**
 * @vitest-environment happy-dom
 *
 * advanced-section mode: basic fields, then a collapsible "Advanced settings"
 * control, then the advanced fields below it (revealed when expanded). All-
 * advanced forms render with no control; the control emits ``advanced-toggle``.
 */
import { render } from "lit";
import { describe, expect, it, vi } from "vitest";

vi.mock("@home-assistant/webawesome/dist/components/icon/icon.js", () => ({}));

import type { ConfigEntry } from "../../../src/api/types/config-entries.js";
import { ConfigEntryType } from "../../../src/api/types/config-entries.js";
import { ESPHomeConfigEntryForm } from "../../../src/components/device/config-entry-form.js";
import { makeConfigEntry } from "../../util/_make-config-entry.js";

const BASIC = makeConfigEntry({
  key: "name",
  type: ConfigEntryType.STRING,
  label: "Name Field",
});
const ADVANCED = makeConfigEntry({
  key: "reboot_timeout",
  type: ConfigEntryType.STRING,
  label: "Advanced Field",
  advanced: true,
});

function renderForm(
  entries: ConfigEntry[],
  opts: {
    showAdvanced?: boolean;
    values?: Record<string, unknown>;
    forceAdvancedControl?: boolean;
  } = {}
): HTMLElement {
  const form = new ESPHomeConfigEntryForm();
  form.entries = entries;
  form.values = opts.values ?? {};
  form.advancedSection = true;
  form.showAdvanced = opts.showAdvanced ?? false;
  form.forceAdvancedControl = opts.forceAdvancedControl ?? false;
  const container = document.createElement("div");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  render((form as any).render(), container);
  return container;
}

function control(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(".advanced-disclosure");
}

describe("config-entry-form advanced-section", () => {
  it("renders the control after basic fields, hides advanced until expanded", () => {
    const c = renderForm([BASIC, ADVANCED]);
    expect(control(c)).toBeTruthy();
    const text = c.textContent ?? "";
    expect(text).toContain("Name Field");
    expect(text).not.toContain("Advanced Field");
  });

  it("reveals advanced fields below the control when expanded", () => {
    const c = renderForm([BASIC, ADVANCED], { showAdvanced: true });
    const text = c.textContent ?? "";
    expect(text).toContain("Advanced Field");
    // control sits between the basic field and the advanced field
    const basicIdx = text.indexOf("Name Field");
    const ctrlIdx = text.indexOf("device.advanced_settings");
    const advIdx = text.indexOf("Advanced Field");
    expect(basicIdx).toBeLessThan(ctrlIdx);
    expect(ctrlIdx).toBeLessThan(advIdx);
  });

  it("auto-opens as a static label (no chevron) when a pre-filled advanced field has a value", () => {
    const c = renderForm([BASIC, ADVANCED], { values: { reboot_timeout: "5min" } });
    expect((c.textContent ?? "").includes("Advanced Field")).toBe(true);
    // It can't be collapsed (a value is set): static label, no toggle chevron,
    // announced as informational rather than a control.
    const ctrl = control(c)!;
    expect(ctrl.tagName).not.toBe("BUTTON");
    expect(ctrl.querySelector("wa-icon")).toBeNull();
    expect(ctrl.getAttribute("role")).toBe("status");
  });

  it("links the disclosure to the advanced region via aria-controls", () => {
    const c = renderForm([BASIC, ADVANCED], { showAdvanced: true });
    expect(control(c)!.getAttribute("aria-controls")).toBe("advanced-fields");
    const region = c.querySelector("#advanced-fields");
    expect(region).toBeTruthy();
    expect((region!.textContent ?? "").includes("Advanced Field")).toBe(true);
  });

  it("shows the control when the only advanced field is nested in a mixed group", () => {
    // The nested group is basic (so it stays in the basic list), but it holds an
    // advanced child — the control must surface or that child is unreachable.
    const nested = makeConfigEntry({
      key: "filters",
      type: ConfigEntryType.NESTED,
      label: "Filters",
      config_entries: [
        makeConfigEntry({
          key: "multiply",
          type: ConfigEntryType.STRING,
          label: "Multiply",
          advanced: true,
        }),
      ],
    });
    expect(control(renderForm([BASIC, nested]))).toBeTruthy();
  });

  it("keeps a recoverable control in an all-advanced form when external content is gated", () => {
    // The script editor sets force-advanced-control to gate its Parameters block
    // outside the form. The control must show, and must NOT auto-open: otherwise
    // the host's showAdvanced never flips and the external block is unreachable.
    const c = renderForm(
      [
        makeConfigEntry({
          key: "a",
          type: ConfigEntryType.STRING,
          label: "Only Advanced",
          advanced: true,
        }),
      ],
      { forceAdvancedControl: true }
    );
    expect(control(c)).toBeTruthy();
    expect((c.textContent ?? "").includes("Only Advanced")).toBe(false);
  });

  it("renders an all-advanced form with no control", () => {
    const c = renderForm([
      makeConfigEntry({
        key: "a",
        type: ConfigEntryType.STRING,
        label: "Only Advanced",
        advanced: true,
      }),
    ]);
    expect(control(c)).toBeNull();
    expect(c.textContent ?? "").toContain("Only Advanced");
  });

  it("emits advanced-toggle when the control is clicked", () => {
    const form = new ESPHomeConfigEntryForm();
    form.entries = [BASIC, ADVANCED];
    form.values = {};
    form.advancedSection = true;
    form.showAdvanced = false;
    const container = document.createElement("div");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render((form as any).render(), container);
    let detail: { show: boolean } | null = null;
    // The control dispatches on the form element (its host), not the button.
    form.addEventListener("advanced-toggle", (e) => {
      detail = (e as CustomEvent<{ show: boolean }>).detail;
    });
    container.querySelector<HTMLElement>(".advanced-disclosure")!.click();
    expect(detail).toEqual({ show: true });
  });
});
