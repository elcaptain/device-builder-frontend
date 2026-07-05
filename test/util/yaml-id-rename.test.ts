import { beforeEach, describe, expect, it } from "vitest";
import {
  _clearIdRenameMemos,
  countIdReferences,
  findIdReferences,
  idDeclaredElsewhere,
  renameIdReferences,
} from "../../src/util/yaml-id-rename.js";
import { _clearYamlSectionsMemo } from "../../src/util/yaml-sections.js";

beforeEach(() => {
  _clearIdRenameMemos();
  _clearYamlSectionsMemo();
});

const APOLLO = `esphome:
  name: mystart

output:
  - platform: ledc
    pin: 18
    id: buzzer_output

rtttl:
  - output: buzzer_output
    id: rtttl_player
`;

describe("findIdReferences", () => {
  it("finds the reference but not the declaration", () => {
    expect(findIdReferences(APOLLO, "buzzer_output")).toEqual([
      { line: 10, kind: "value" },
    ]);
  });

  it("respects the excluded section range", () => {
    expect(
      findIdReferences(APOLLO, "buzzer_output", {
        excludeFromLine: 9,
        excludeToLine: 11,
      })
    ).toEqual([]);
  });

  it("treats a nested id key as a reference (automation action target)", () => {
    const yaml = `switch:
  - platform: gpio
    id: relay1
    pin: 4

button:
  - platform: template
    name: Toggle
    on_press:
      - switch.toggle:
          id: relay1
`;
    expect(findIdReferences(yaml, "relay1")).toEqual([{ line: 11, kind: "value" }]);
  });

  it("finds bare sequence items and quoted values", () => {
    const yaml = `output:
  - platform: ledc
    id: out_a

light:
  - platform: rgb
    name: RGB
    red: "out_a"
    outputs:
      - out_a
`;
    expect(findIdReferences(yaml, "out_a").map((s) => s.line)).toEqual([8, 10]);
  });

  it("finds id() calls inside lambdas", () => {
    const yaml = `output:
  - platform: ledc
    id: out_a

sensor:
  - platform: template
    lambda: |-
      id(out_a).turn_on();
      return id(out_a2).state;
    on_value: !lambda 'id(out_a).update();'
`;
    expect(findIdReferences(yaml, "out_a")).toEqual([
      { line: 8, kind: "lambda" },
      { line: 10, kind: "lambda" },
    ]);
  });

  it("skips free-text keys whose value matches the id", () => {
    const yaml = `output:
  - platform: ledc
    id: dark

text_sensor:
  - platform: template
    name: dark
    icon: dark
    device_class: dark
`;
    expect(findIdReferences(yaml, "dark")).toEqual([]);
  });

  it("does not match longer identifiers or other ids", () => {
    const yaml = `rtttl:
  - output: buzzer_outputd
    id: rtttl_player
`;
    expect(findIdReferences(yaml, "buzzer_output")).toEqual([]);
  });
});

describe("renameIdReferences", () => {
  it("rewrites the reference and leaves the declaration to the caller", () => {
    const out = renameIdReferences(APOLLO, "buzzer_output", "buzzer_outputd", {
      excludeFromLine: 4,
      excludeToLine: 7,
    });
    expect(out).toContain("- output: buzzer_outputd");
    expect(out).toContain("id: buzzer_output\n");
  });

  it("preserves quoting and trailing comments", () => {
    const yaml = `output:
  - platform: ledc
    id: out_a

light:
  - platform: rgb
    red: "out_a" # main channel
`;
    const out = renameIdReferences(yaml, "out_a", "out_b", {
      excludeFromLine: 2,
      excludeToLine: 3,
    });
    expect(out).toContain('red: "out_b" # main channel');
  });

  it("rewrites flow-sequence elements", () => {
    const yaml = `switch:
  - platform: gpio
    id: relay1
    pin: 4
  - platform: gpio
    id: relay2
    pin: 5
    interlock: [relay1, relay2]
`;
    const out = renameIdReferences(yaml, "relay1", "relay_main", {
      excludeFromLine: 2,
      excludeToLine: 4,
    });
    expect(out).toContain("interlock: [relay_main, relay2]");
  });

  it("rewrites lambda calls without touching similar tokens", () => {
    const yaml = `script:
  - id: beep
    then:
      - lambda: 'id(out_a).play(); some_id(out_a); id(out_a2).stop();'
`;
    const out = renameIdReferences(yaml, "out_a", "out_b");
    expect(out).toContain("id(out_b).play()");
    expect(out).toContain("some_id(out_a)");
    expect(out).toContain("id(out_a2).stop()");
  });

  it("returns the buffer unchanged when nothing references the id", () => {
    expect(renameIdReferences(APOLLO, "nope", "still_nope")).toBe(APOLLO);
  });

  it("rewrites a substitution value holding the id, leaving ${...} usages alone", () => {
    const yaml = `substitutions:
  buzzer: buzzer_output

output:
  - platform: ledc
    id: buzzer_output

rtttl:
  - output: \${buzzer}
    id: player

script:
  - id: beep
    then:
      - lambda: 'id(\${buzzer}).play();'
`;
    const out = renameIdReferences(yaml, "buzzer_output", "buzzer_out2", {
      excludeFromLine: 4,
      excludeToLine: 6,
    });
    // The substitution's value follows the rename, so every ${buzzer}
    // usage keeps resolving; the usages themselves stay untouched.
    expect(out).toContain("buzzer: buzzer_out2");
    expect(out).toContain("- output: ${buzzer}");
    expect(out).toContain("id(${buzzer}).play()");
  });
});

describe("countIdReferences", () => {
  it("counts references, several ids against one buffer", () => {
    expect(countIdReferences(APOLLO, "buzzer_output")).toBe(1);
    expect(countIdReferences(APOLLO, "rtttl_player")).toBe(0);
    expect(countIdReferences(APOLLO, "buzzer_output")).toBe(1);
  });

  it("does not count a globals declaration as a reference", () => {
    const yaml = `globals:
  - id: counter_a
    type: int
  - id: counter_b
    type: int

sensor:
  - platform: template
    lambda: 'return id(counter_b);'
`;
    expect(countIdReferences(yaml, "counter_a")).toBe(0);
    expect(countIdReferences(yaml, "counter_b")).toBe(1);
  });

  it("returns zero for a non-identifier value instead of throwing", () => {
    expect(countIdReferences(APOLLO, "${sub}")).toBe(0);
    expect(countIdReferences(APOLLO, "bad(id")).toBe(0);
  });
});

describe("idDeclaredElsewhere", () => {
  const DUP = `output:
  - platform: ledc
    id: shared

switch:
  - platform: gpio
    id: shared
    pin: 4
`;

  it("detects a surviving declaration outside the excluded range", () => {
    expect(
      idDeclaredElsewhere(DUP, "shared", { excludeFromLine: 2, excludeToLine: 3 })
    ).toBe(true);
  });

  it("is false when the only declaration is the excluded one", () => {
    expect(
      idDeclaredElsewhere(APOLLO, "buzzer_output", {
        excludeFromLine: 4,
        excludeToLine: 7,
      })
    ).toBe(false);
  });
});
