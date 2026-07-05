/**
 * @vitest-environment happy-dom
 *
 * Pins the section editor's ID rename propagation: renaming a declaring
 * id through the form rewrites every reference to the old id in the same
 * yaml-draft, with the guardrails that keep half-renames impossible.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner-js", () => ({
  default: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

import type { ESPHomeAPI } from "../../../src/api/index.js";
import { ConfigEntryType } from "../../../src/api/types/config-entries.js";
import { ESPHomeDeviceSectionConfig } from "../../../src/components/device/device-section-config.js";
import {
  flushDraft,
  onValueChange,
} from "../../../src/components/device/device-section-config/draft-and-delete.js";
import {
  _clearComponentCache,
  fetchComponent,
} from "../../../src/util/component-name-cache.js";
import { _clearIdRenameMemos } from "../../../src/util/yaml-id-rename.js";
import { _clearYamlSectionsMemo } from "../../../src/util/yaml-sections.js";
import { makeEntry } from "./_renderer-fixtures.js";

// The scan resolves reference keys from cached schemas; seed the ones
// the fixtures' foreign sections use.
const BODIES = {
  rtttl: {
    id: "rtttl",
    name: "rtttl",
    config_entries: [{ key: "output", type: "id", references_component: "output" }],
  },
} as never as Record<string, never>;

const api = {
  getComponentBodies: async (ids: string[]) =>
    Object.fromEntries(ids.filter((id) => id in BODIES).map((id) => [id, BODIES[id]])),
} as unknown as ESPHomeAPI;

beforeEach(async () => {
  _clearComponentCache();
  _clearIdRenameMemos();
  await Promise.all(Object.keys(BODIES).map((id) => fetchComponent(api, id)));
});

const APOLLO = `output:
  - platform: ledc
    pin: 18
    id: buzzer_output

rtttl:
  - output: buzzer_output
    id: rtttl_player
`;

/* eslint-disable @typescript-eslint/no-explicit-any */
function host(yaml: string, values: Record<string, unknown>) {
  _clearYamlSectionsMemo();
  const c = new ESPHomeDeviceSectionConfig();
  const inner = c as any;
  inner.yaml = yaml;
  inner.sectionKey = "output.ledc";
  inner.fromLine = 2;
  inner._config = {
    entries: [
      makeEntry(ConfigEntryType.STRING, { key: "platform" }),
      makeEntry(ConfigEntryType.INTEGER, { key: "pin" }),
      makeEntry(ConfigEntryType.ID, { key: "id" }),
    ],
  };
  inner._presentComponents = new Set<string>();
  inner._values = values;
  inner._scheduleDraftFlush = vi.fn();
  const drafts: string[] = [];
  c.addEventListener("yaml-draft", (e) =>
    drafts.push((e as CustomEvent).detail.yaml as string)
  );
  return { c, inner, drafts };
}

const rename = (c: ESPHomeDeviceSectionConfig, value: string) =>
  onValueChange(c, new CustomEvent("value-change", { detail: { path: ["id"], value } }));

describe("device-section-config — id rename propagation", () => {
  it("rewrites the declaration and its references in one draft", () => {
    const { c, inner, drafts } = host(APOLLO, {
      platform: "ledc",
      pin: 18,
      id: "buzzer_output",
    });
    rename(c, "buzzer_outputd");
    flushDraft(inner);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toContain("id: buzzer_outputd");
    expect(drafts[0]).toContain("- output: buzzer_outputd");
    expect(drafts[0]).not.toContain("buzzer_output\n");
    expect(inner._pendingIdRenames.size).toBe(0);
  });

  it("tracks chained renames across flushes", () => {
    const { c, inner, drafts } = host(APOLLO, {
      platform: "ledc",
      pin: 18,
      id: "buzzer_output",
    });
    rename(c, "buzzer_o");
    flushDraft(inner);
    inner.yaml = drafts[0];
    rename(c, "buzzer_od");
    flushDraft(inner);
    expect(drafts[1]).toContain("- output: buzzer_od");
  });

  it("keeps the pending rename through an invalid intermediate value", () => {
    const { c, inner, drafts } = host(APOLLO, {
      platform: "ledc",
      pin: 18,
      id: "buzzer_output",
    });
    rename(c, "");
    flushDraft(inner);
    expect(inner._pendingIdRenames.size).toBe(1);
    inner.yaml = drafts.length ? drafts[drafts.length - 1] : inner.yaml;
    rename(c, "buzzer_final");
    flushDraft(inner);
    expect(drafts[drafts.length - 1]).toContain("- output: buzzer_final");
  });

  it("does not propagate when the old id survives in another section", () => {
    const dup = `output:
  - platform: ledc
    pin: 18
    id: shared

switch:
  - platform: gpio
    id: shared
    pin: 4

rtttl:
  - output: shared
    id: rtttl_player
`;
    const { c, inner, drafts } = host(dup, {
      platform: "ledc",
      pin: 18,
      id: "shared",
    });
    rename(c, "renamed");
    flushDraft(inner);
    expect(drafts[0]).toContain("id: renamed");
    // The switch still declares `shared`; the rtttl reference must keep
    // pointing at it.
    expect(drafts[0]).toContain("- output: shared");
  });

  it("does not propagate a reverted edit", () => {
    const { c, inner, drafts } = host(APOLLO, {
      platform: "ledc",
      pin: 18,
      id: "buzzer_output",
    });
    rename(c, "buzzer_x");
    rename(c, "buzzer_output");
    flushDraft(inner);
    expect(drafts).toHaveLength(0);
    expect(inner._pendingIdRenames.size).toBe(0);
  });
});
