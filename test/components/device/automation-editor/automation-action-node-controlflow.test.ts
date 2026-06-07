/**
 * @vitest-environment happy-dom
 *
 * A control-flow action (repeat / if / while) carries both scalar
 * params (repeat's required `count`) and nested action lists (`then`).
 * #1285: the `count` field was missing because the node never got
 * hydrated config_entries; once hydrated, the node must render the
 * params form AND the nested list - having children must not suppress
 * the params form. Heavy children are no-op mocked.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../src/components/device/config-entry-form.js", () => ({}));
vi.mock(
  "../../../../src/components/device/automation-editor/automation-action-list.js",
  () => ({})
);
vi.mock(
  "../../../../src/components/device/automation-editor/automation-condition-tree.js",
  () => ({})
);
vi.mock(
  "../../../../src/components/device/automation-editor/catalog-picker-dialog.js",
  () => ({})
);
vi.mock("@home-assistant/webawesome/dist/components/icon/icon.js", () => ({}));
vi.mock("@home-assistant/webawesome/dist/components/option/option.js", () => ({}));
vi.mock("@home-assistant/webawesome/dist/components/select/select.js", () => ({}));
vi.mock("@home-assistant/webawesome/dist/components/switch/switch.js", () => ({}));

import type {
  ActionNode,
  AutomationAction,
} from "../../../../src/api/types/automations.js";
import type { ConfigEntry } from "../../../../src/api/types/config-entries.js";
import { ESPHomeAutomationActionNode } from "../../../../src/components/device/automation-editor/automation-action-node.js";

const countEntry = {
  key: "count",
  type: "integer",
  label: "Count",
  required: true,
} as unknown as ConfigEntry;

const repeatAction: AutomationAction = {
  id: "repeat",
  name: "Repeat",
  description: "",
  config_entries: [countEntry],
  accepts_action_list: ["then"],
  is_control_flow: true,
} as unknown as AutomationAction;

const repeatNode: ActionNode = {
  action_id: "repeat",
  params: {},
  children: { then: [] },
} as unknown as ActionNode;

async function mountNode(): Promise<ESPHomeAutomationActionNode> {
  const el = new ESPHomeAutomationActionNode();
  el.value = repeatNode;
  el.catalog = [repeatAction];
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe("automation-action-node control-flow rendering (#1285)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the params form for a control-flow action that has nested children", async () => {
    const el = await mountNode();
    // The repeat count form must render despite the action also having a
    // nested `then` list (the bug rendered nothing).
    expect(el.shadowRoot!.querySelector("esphome-config-entry-form")).not.toBeNull();
  });

  it("renders the nested action list alongside the params form", async () => {
    const el = await mountNode();
    expect(el.shadowRoot!.querySelector("esphome-automation-action-list")).not.toBeNull();
  });
});
