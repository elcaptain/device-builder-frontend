// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

// The SDK module only needs to register the custom element as a side effect;
// in happy-dom ``createElement`` yields a generic element we drive directly.
vi.mock("improv-wifi-serial-sdk/dist/serial-provision-dialog", () => ({}));
vi.mock("sonner-js", () => ({ default: { error: vi.fn() } }));

import toast from "sonner-js";
import { openImprovDialog } from "../../src/web/improv/open-improv-dialog.js";

const localize: (k: string, v?: Record<string, string | number>) => string = (k) => k;
const flush = () => new Promise((r) => setTimeout(r, 0));

function makePort(openImpl?: () => Promise<void>): {
  open: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  readable: unknown;
  writable: unknown;
} {
  return {
    open: vi.fn(openImpl ?? (async () => {})),
    close: vi.fn(async () => {}),
    readable: null,
    writable: null,
  };
}

function dialogEl(): HTMLElement | null {
  return document.querySelector("improv-wifi-serial-provision-dialog");
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("openImprovDialog", () => {
  it("opens the port at 115200 and mounts the SDK dialog", async () => {
    const port = makePort();
    const promise = openImprovDialog(port as unknown as SerialPort, localize);
    await flush();

    expect(port.open).toHaveBeenCalledWith({ baudRate: 115200 });
    const el = dialogEl();
    expect(el).toBeTruthy();
    expect((el as unknown as { port: unknown }).port).toBe(port);

    el!.dispatchEvent(new CustomEvent("closed", { detail: { provisioned: true } }));
    await expect(promise).resolves.toBe(true);
  });

  it("resolves false and closes the port when not provisioned", async () => {
    const port = makePort();
    const promise = openImprovDialog(port as unknown as SerialPort, localize);
    await flush();

    dialogEl()!.dispatchEvent(
      new CustomEvent("closed", { detail: { provisioned: false } })
    );
    await expect(promise).resolves.toBe(false);
    expect(port.close).toHaveBeenCalledOnce();
  });

  it("does NOT remove the dialog itself (the SDK owns removal)", async () => {
    const port = makePort();
    const promise = openImprovDialog(port as unknown as SerialPort, localize);
    await flush();

    dialogEl()!.dispatchEvent(new CustomEvent("closed", { detail: {} }));
    await promise;
    // Wrapper left the element in place; the real SDK's _handleClose removes it
    // after firing "closed" — a second removal here would crash removeChild.
    expect(dialogEl()).toBeTruthy();
  });

  it("proceeds when the port is already open (InvalidStateError)", async () => {
    const port = makePort(async () => {
      throw new DOMException("already open", "InvalidStateError");
    });
    const promise = openImprovDialog(port as unknown as SerialPort, localize);
    await flush();

    expect(dialogEl()).toBeTruthy();
    dialogEl()!.dispatchEvent(new CustomEvent("closed", { detail: {} }));
    await promise;
  });

  it("toasts and returns false without mounting when open fails", async () => {
    const port = makePort(async () => {
      throw new Error("device gone");
    });
    const result = await openImprovDialog(port as unknown as SerialPort, localize);

    expect(result).toBe(false);
    expect(toast.error).toHaveBeenCalledOnce();
    expect(dialogEl()).toBeNull();
  });
});
