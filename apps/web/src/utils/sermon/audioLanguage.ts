import { i18n, isValidLocale, type Locale } from "@src/i18n/config";

/**
 * Which audio-language notice a sermon page should render, or `null` for none.
 * The union members are also the i18n key suffixes (`Sermons.audio-language.*`),
 * so the compiler ties the rule to the copy.
 */
export type AudioLanguageNotice = "es" | "en" | "bilingual" | null;

/**
 * Sanitize Contentful's `audioLanguages` into a non-empty list of known locales.
 *
 * Absent / empty / all-unknown => `["es-AR"]`. Historically every sermon was
 * preached in Spanish, so "no data" means "Spanish" — that is what lets the 4
 * legacy sermons render correctly with the field entirely absent, WITHOUT a
 * required-field migration (ICR-146 AC2/AC7). The backfill sets explicit values,
 * but this default must survive it: a human authoring in the Contentful UI (or
 * /predica before ICR-147 lands) can still leave the field empty.
 */
export function normalizeAudioLanguages(
  value: readonly string[] | undefined | null,
): Locale[] {
  const known = (value ?? []).filter(isValidLocale);
  const unique = [...new Set(known)];
  return unique.length > 0 ? unique : [i18n.defaultLocale];
}

/**
 * The single display rule: announce the audio's language only when it DIFFERS
 * from the language the visitor is reading. A Spanish sermon on the Spanish page
 * needs no label; the same sermon on the English page does.
 *
 * A bilingual recording is never "exactly the page language", so it is always
 * announced — on both locales.
 */
export function getAudioLanguageNotice(
  audioLanguages: readonly string[] | undefined | null,
  pageLocale: Locale,
): AudioLanguageNotice {
  const languages = normalizeAudioLanguages(audioLanguages);

  if (languages.length > 1) return "bilingual";

  const only = languages[0];
  if (only === pageLocale) return null;

  return only === "es-AR" ? "es" : "en";
}
