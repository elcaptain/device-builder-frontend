/**
 * @vitest-environment happy-dom
 *
 * Pins the self-contained archived-devices-dialog actions (#1320): unarchive
 * and confirmed-delete call the WS API and refresh the list in place, and the
 * delete is gated behind the nested confirm. Self-containment is what lets the
 * dialog open over the editor, where no dashboard parent handles its actions.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("sonner-js", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

import type { ArchivedDevice } from "../../src/api/types/system.js";
import { ESPHomeArchivedDevicesDialog } from "../../src/components/archived-devices-dialog.js";

const DEVICE = {
  name: "foo-1234",
  friendly_name: "Foo",
  configuration: "foo.yaml",
} as unknown as ArchivedDevice;

function makeDialog(api: Record<string, unknown>) {
  const el = new ESPHomeArchivedDevicesDialog();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const priv = el as any;
  priv._api = api;
  return priv;
}

describe("archived-devices-dialog self-contained actions", () => {
  it("unarchive calls the WS API and refreshes the list", async () => {
    const unarchiveDevice = vi.fn().mockResolvedValue(undefined);
    const listArchivedDevices = vi.fn().mockResolvedValue([]);
    const priv = makeDialog({ unarchiveDevice, listArchivedDevices });

    await priv._unarchive(DEVICE);

    expect(unarchiveDevice).toHaveBeenCalledWith("foo.yaml");
    expect(listArchivedDevices).toHaveBeenCalledTimes(1);
  });

  it("delete stages the pending device without touching the WS API (gated behind confirm)", () => {
    const deleteArchivedDevice = vi.fn();
    const priv = makeDialog({ deleteArchivedDevice });

    priv._deletePermanently(DEVICE);

    expect(priv._pendingDelete).toBe(DEVICE);
    expect(deleteArchivedDevice).not.toHaveBeenCalled();
  });

  it("confirming the delete calls the WS API, refreshes, and clears the pending device", async () => {
    const deleteArchivedDevice = vi.fn().mockResolvedValue(undefined);
    const listArchivedDevices = vi.fn().mockResolvedValue([]);
    const priv = makeDialog({ deleteArchivedDevice, listArchivedDevices });

    priv._deletePermanently(DEVICE);
    await priv._onDeleteConfirm();

    expect(deleteArchivedDevice).toHaveBeenCalledWith("foo.yaml");
    expect(listArchivedDevices).toHaveBeenCalledTimes(1);
    expect(priv._pendingDelete).toBeNull();
  });

  it("cancelling the delete clears the pending device and skips the WS call", () => {
    const deleteArchivedDevice = vi.fn();
    const priv = makeDialog({ deleteArchivedDevice });

    priv._deletePermanently(DEVICE);
    priv._onDeleteCancel();

    expect(priv._pendingDelete).toBeNull();
    expect(deleteArchivedDevice).not.toHaveBeenCalled();
  });
});
