import { ESPHomeLogParser, isLikelyGarbageLine } from "./esphome-log-parser.js";

/**
 * ``[HH:MM:SS]`` receive-time stamp for a serial log line. esphome/dashboard's
 * ``TimestampTransformer`` prefixes every WS chunk unconditionally; we match
 * that here so the Web Serial log path reads identically to the WS one.
 */
export function formatSerialTimestamp(now: Date): string {
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `[${hh}:${mm}:${ss}]`;
}

export interface SerialLineHooks {
  /** One formatted log line (timestamp + parser color/prefix already applied). */
  onLine: (line: string) => void;
}

/**
 * Read an **already-open** Web Serial port line by line, applying the same
 * formatting the backend logs CLI does: per-line ANSI color/header
 * re-application via :class:`ESPHomeLogParser`, a receive-time timestamp, and
 * baud-mismatch garbage filtering. Emits each finished line through
 * ``hooks.onLine``.
 *
 * Returns a cancel that stops the loop and closes the port (releasing the
 * reader lock first — closing a still-locked port fails and blocks the next
 * ``open()``). The caller owns ``port.open()``.
 *
 * Shared by the dashboard's post-install serial logs
 * (``streamSerialToDialog``) and ESPHome Web's logs dialog, so both web-serial
 * log surfaces stay byte-for-byte identical.
 */
export function streamSerialLines(port: SerialPort, hooks: SerialLineHooks): () => void {
  /* Read directly from ``port.readable.getReader()`` and decode in userland
     rather than going through ``port.readable.pipeTo()`` + a
     ``TextDecoderStream``. The pipeTo plumbing has been observed to silently
     swallow bytes on some bridge chips (notably CH9102F) after a close/reopen
     within the same USB session — direct reads do not. */
  const reader = port.readable!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let cancelled = false;
  // Raw UART logs skip the backend's per-line formatting, so a multi-line
  // ESPHome record (color opened once, continuation lines indented) loses its
  // color/header when split on \n. Re-apply per line, like aioesphomeapi's
  // LogParser does for the esphome-logs CLI.
  const parser = new ESPHomeLogParser();

  const readLoop = async (): Promise<void> => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done || cancelled) break;
        if (value && value.length) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            /* Strip trailing CR (CRLF endings from the ROM bootloader and many
               serial sources). ``ansi-log`` treats any chunk ending in ``\r``
               as a progress-style overwrite, so CRLF boot lines would collapse
               to just the last one. */
            const cleaned = line.endsWith("\r") ? line.slice(0, -1) : line;
            // Drop mis-sampled UART garbage (e.g. an ESP8266's 74880-baud boot
            // banner read at the app's baud) before it reaches the parser.
            if (isLikelyGarbageLine(cleaned)) continue;
            hooks.onLine(
              `${formatSerialTimestamp(new Date())}${parser.parseLine(cleaned)}`
            );
          }
        }
      }
    } catch {
      /* Port closed or reader cancelled — both are normal exits. */
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* Lock already released — ignore. */
      }
    }
  };

  void readLoop();

  return () => {
    if (cancelled) return;
    cancelled = true;
    // Stop the loop, then close the port once the reader lock is released
    // (closing a still-locked port fails, leaving it open and blocking the
    // next open()).
    reader
      .cancel()
      .catch(() => {
        /* Already disposed — nothing to do. */
      })
      .finally(() => {
        port.close().catch(() => {
          /* Port already closed (user pulled the cable, etc). */
        });
      });
  };
}
