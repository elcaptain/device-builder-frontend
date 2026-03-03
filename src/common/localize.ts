/**
 * Localization helpers.
 *
 * - Provides a synchronous `defaultLocalize` built from English so the UI
 *   never shows raw keys on first paint.
 * - `loadLocalize()` detects the browser language, loads the matching JSON,
 *   and overlays it on top of the English base (per-key English fallback).
 */
import enMessages from "../translations/en.json";

export type LocalizeFunc = (
  key: string,
  values?: Record<string, string | number>
) => string;

const SUPPORTED_LOCALES = ["en", "fr", "nl"] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

function detectLocale(): SupportedLocale {
  const lang = navigator.language.split("-")[0];
  return (SUPPORTED_LOCALES as readonly string[]).includes(lang)
    ? (lang as SupportedLocale)
    : "en";
}

async function loadLocaleMessages(
  locale: Exclude<SupportedLocale, "en">
): Promise<Record<string, string>> {
  switch (locale) {
    case "fr":
      return (await import("../translations/fr.json")).default as Record<
        string,
        string
      >;
    case "nl":
      return (await import("../translations/nl.json")).default as Record<
        string,
        string
      >;
  }
}

function interpolate(
  template: string,
  values?: Record<string, string | number>
): string {
  if (!values) return template;
  return template.replace(
    /\{(\w+)\}/g,
    (_, key) => String(values[key] ?? `{${key}}`)
  );
}

function buildLocalize(messages: Record<string, string>): LocalizeFunc {
  return (key, values) => interpolate(messages[key] ?? key, values);
}

/** Synchronous English fallback — safe to use as an initial context value. */
export const defaultLocalize: LocalizeFunc = buildLocalize(
  enMessages as Record<string, string>
);

/**
 * Loads the browser locale (with per-key English fallback) asynchronously.
 * Replace the context value with the result once resolved.
 */
export async function loadLocalize(): Promise<LocalizeFunc> {
  const locale = detectLocale();
  if (locale === "en") return defaultLocalize;

  const localeMessages = await loadLocaleMessages(locale);
  return buildLocalize({
    ...(enMessages as Record<string, string>),
    ...localeMessages,
  });
}
