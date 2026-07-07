/**
 * The ESPHome Web flash engine, shared by the upload and adoptable install
 * dialogs. Reuses ``web-serial.ts`` end to end: connect + detect the chip,
 * ask the plan which binaries to flash, optionally erase, write each part with
 * aggregate progress, then hard-reset so the new firmware boots.
 *
 * Pure orchestration over callbacks — no DOM — so a dialog just renders the
 * reported state.
 */
import {
  connectToPort,
  disconnect,
  flashFirmware,
  isPortPickerCancel,
  resetAndDisconnect,
  type DetectedChip,
} from "../../util/web-serial.js";
import type { FlashPart } from "../util/esphome-web-firmware.js";

export type FlashStep =
  "connecting" | "preparing" | "erasing" | "flashing" | "done" | "error";

export interface FlashPlan {
  /** Whether to erase the whole flash before writing (upload path). */
  erase?: boolean;
  /**
   * Given the detected chip family (esptool ``chip.CHIP_NAME``, e.g.
   * ``ESP32-C3``), return the parts to flash. Throws to abort with a message.
   */
  filesCallback: (chipFamily: string) => Promise<FlashPart[]>;
}

export interface FlashHooks {
  onStep: (step: FlashStep) => void;
  onProgress: (percent: number) => void;
  onLog: (line: string) => void;
  onError: (message: string) => void;
}

/** Best-effort teardown of a half-open connection after a failure. */
async function safeDisconnect(detected: DetectedChip): Promise<void> {
  try {
    await disconnect(detected.transport);
  } catch {
    // Port may already be closed / gone; nothing more to do.
  }
}

/**
 * Run a flash plan against an authorized (closed) port. Returns ``true`` on a
 * completed flash + reset, ``false`` on cancel or failure (the hooks carry the
 * detail). Never throws — the caller renders from the reported state.
 */
export async function runFlash(
  port: SerialPort,
  plan: FlashPlan,
  hooks: FlashHooks
): Promise<boolean> {
  hooks.onStep("connecting");
  let detected: DetectedChip;
  try {
    detected = await connectToPort(port, hooks.onLog);
  } catch (err) {
    if (isPortPickerCancel(err)) return false;
    hooks.onStep("error");
    hooks.onError(err instanceof Error ? err.message : String(err));
    return false;
  }

  const chipFamily = detected.loader.chip?.CHIP_NAME ?? detected.chipName;

  let parts: FlashPart[];
  try {
    hooks.onStep("preparing");
    parts = await plan.filesCallback(chipFamily);
    if (parts.length === 0) throw new Error("No firmware to flash.");
  } catch (err) {
    hooks.onStep("error");
    hooks.onError(err instanceof Error ? err.message : String(err));
    await safeDisconnect(detected);
    return false;
  }

  try {
    if (plan.erase) {
      hooks.onStep("erasing");
      await detected.loader.eraseFlash();
    }
    hooks.onStep("flashing");
    const total = parts.reduce((sum, p) => sum + p.data.length, 0);
    let flashed = 0;
    for (const part of parts) {
      await flashFirmware(detected.loader, part.data, part.address, (p) => {
        const current = flashed + (p.percent / 100) * part.data.length;
        hooks.onProgress(total === 0 ? 100 : Math.round((current / total) * 100));
      });
      flashed += part.data.length;
    }
    hooks.onProgress(100);
    hooks.onStep("done");
    await resetAndDisconnect(detected.loader, detected.transport, detected.port);
    return true;
  } catch (err) {
    hooks.onStep("error");
    hooks.onError(err instanceof Error ? err.message : String(err));
    await safeDisconnect(detected);
    return false;
  }
}
