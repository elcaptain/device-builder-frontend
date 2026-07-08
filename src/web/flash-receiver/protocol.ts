/**
 * The postMessage flash contract between the Device Builder dashboard (the
 * opener, on any http/https origin) and this receiver (a fixed secure-context
 * origin, web.esphome.io). Mirrors the sender in ``src/util/usb-flasher.ts``
 * and the reference in the device-builder repo's ``flasher/src/protocol.ts``.
 *
 * The opener origin is unknown (the HA add-on runs on an arbitrary http
 * origin), so the channel is authenticated by a one-time ``nonce`` plus an
 * ``event.source === window.opener`` check, never an origin allowlist. The
 * nonce travels one way only (opener → receiver): inbound firmware must carry
 * it, but no outbound frame (ready/state/progress) echoes it, so the
 * pre-handoff ``ready`` broadcast leaks no secret.
 */
export const PROTOCOL_VERSION = 1;

export const MSG_READY = "esphome-web-flash:ready";
export const MSG_FIRMWARE = "esphome-web-flash:firmware";
export const MSG_STATE = "esphome-web-flash:state";
export const MSG_PROGRESS = "esphome-web-flash:progress";

/** One image to write, bytes riding as a transferable ArrayBuffer. */
export interface FlashPartMessage {
  address: number;
  data: ArrayBuffer;
}

/** Opener → receiver: the firmware handoff. */
export interface FirmwareMessage {
  type: typeof MSG_FIRMWARE;
  nonce: string;
  /** The opener's protocol version; absent means v1. */
  version?: number;
  name?: string;
  /** The device's friendly name, for the receiver's title. */
  deviceName?: string;
  erase?: boolean;
  parts: FlashPartMessage[];
}

export type FlashState = "connecting" | "installing" | "done" | "error";

/** Runtime guard for a well-formed ``parts`` array (untrusted postMessage). */
export function isFlashParts(parts: unknown): parts is FlashPartMessage[] {
  return (
    Array.isArray(parts) &&
    parts.length > 0 &&
    parts.every((p) => {
      if (!p || typeof p !== "object") return false;
      const address = (p as { address?: unknown }).address;
      return (
        typeof address === "number" &&
        Number.isInteger(address) &&
        address >= 0 &&
        (p as { data?: unknown }).data instanceof ArrayBuffer
      );
    })
  );
}
