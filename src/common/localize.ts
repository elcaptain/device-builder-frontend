/**
 * Localization helpers.
 *
 * - Detects the browser language and loads the matching translation file.
 * - Falls back to English when the language is not supported.
 * - Returns a LocalizeFunc that resolves a dot-separated key to a translated
 *   string, with optional {placeholder} interpolation.
 */

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

async function loadMessages(
  locale: SupportedLocale
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
    default:
      return (await import("../translations/en.json")).default as Record<
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

export async function loadLocalize(): Promise<LocalizeFunc> {
  const locale = detectLocale();
  const messages = await loadMessages(locale);

  return (key: string, values?: Record<string, string | number>): string => {
    const template = messages[key] ?? key;
    return interpolate(template, values);
  };
}
