/**
 * @vitest-environment happy-dom
 *
 * Pins that the kebab "Archived devices" item fires a bubbling, composed
 * ``open-archived-devices`` event (#1320). The app shell hosts the dialog at
 * the root and listens for this, so it opens on any route — including over the
 * editor, unlike the old dashboard-scoped window event.
 */
import { describe, expect, it, vi } from "vitest";

import { ESPHomeHeaderActions } from "../../src/components/esphome-header-actions.js";

describe("header-actions archived-devices trigger", () => {
  it("dispatches a bubbling, composed open-archived-devices event", () => {
    const el = new ESPHomeHeaderActions();
    const onEvent = vi.fn();
    el.addEventListener("open-archived-devices", onEvent);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (el as any)._openArchivedDevices();

    expect(onEvent).toHaveBeenCalledTimes(1);
    const event = onEvent.mock.calls[0][0] as CustomEvent;
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
  });
});
