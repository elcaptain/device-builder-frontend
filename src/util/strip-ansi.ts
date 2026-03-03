/**
 * Utility to strip ANSI escape codes from log output.
 */
const ANSI_REGEX = /\u001b\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, "");
}
